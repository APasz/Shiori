<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		apiErrorSchema,
		currencyConversionRatesResponseSchema,
		editSaveResponseSchema,
		expenseDeleteRequestSchema,
		expenseSaveRequestSchema
	} from '$lib/editing/contracts';
	import {
		expenseCategoryLabels,
		summarizeExpenses,
		type CurrencyTotal,
		type ExpenseOverview
	} from '$lib/costs/overview';
	import { formatCalendarDate } from '$lib/itinerary/calendar';
	import {
		currencyCodeSchema,
		expenseCategorySchema,
		type CurrencyCode,
		type Expense,
		type ExpenseCategory
	} from '$lib/itinerary/schema';
	import { amountInputValue, amountMinorFromInput, convertAmountMinor, formatMonetaryAmount } from '$lib/money';
	import { clearOfflineTripPages, refreshOfflineTripPage } from '$lib/offline';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageData } from './$types';

	type ConversionStatus = 'loading' | 'ready' | 'unavailable';
	type ExpenseEditorMode = 'create' | 'edit';
	type ExpenseDraft = {
		amount: string;
		availableForItemCosts: boolean;
		category: ExpenseCategory;
		currency: CurrencyCode;
		id: string;
		note: string;
		paid: boolean;
		paidDate: string;
		title: string;
		useDate: string;
	};

	let { data }: { data: PageData } = $props();
	let editingExpense = $state<ExpenseDraft | null>(null);
	let expenseEditorMode = $state<ExpenseEditorMode | null>(null);
	let expenseError = $state<string | null>(null);
	let expenseSaving = $state(false);
	let deletingExpenseId = $state<string | null>(null);
	let summaryCurrency = $state<CurrencyCode>(initialSummaryCurrency());
	let conversionRates = $state<ReadonlyMap<CurrencyCode, number>>(new Map());
	let conversionStatus = $state<ConversionStatus>('loading');
	let conversionError = $state<string | null>(null);
	let conversionEffectiveDate = $state<string | null>(null);

	const overview = $derived(summarizeExpenses(data.trip.itinerary));
	const expenses = $derived([...data.trip.itinerary.expenses].sort(compareExpenses));
	const conversionEndpoint = $derived(resolve('/api/exchange-rates'));
	const expensesEndpoint = $derived(resolve('/api/trips/[tripId]/expenses', { tripId: data.trip.id }));
	const itineraryHref = $derived(resolve('/trips/[slug]', { slug: data.trip.slug }));
	const notesHref = $derived(resolve('/trips/[slug]/notes', { slug: data.trip.slug }));
	const sourceCurrencies = $derived(sourceCurrenciesFor(overview));
	const canStartExpenseAction = $derived(
		data.trip.canEdit && !expenseSaving && deletingExpenseId === null && expenseEditorMode === null
	);
	const currencyOptions = currencyCodeSchema.options;
	const categoryOptions = expenseCategorySchema.options;

	function initialSummaryCurrency(): CurrencyCode {
		return data.trip.itinerary.localCurrency;
	}

	function sourceCurrenciesFor(expenseOverview: ExpenseOverview): CurrencyCode[] {
		return [...new Set([...expenseOverview.paid, ...expenseOverview.unpaid].map((total) => total.currency))].sort();
	}

	function expenseDate(expense: Expense): string | undefined {
		return expense.useDate ?? (expense.status === 'paid' ? expense.paidDate : undefined);
	}

	function compareExpenses(left: Expense, right: Expense): number {
		const leftDate = expenseDate(left) ?? '';
		const rightDate = expenseDate(right) ?? '';
		return (
			rightDate.localeCompare(leftDate) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
		);
	}

	function formatSourceTotals(totals: readonly CurrencyTotal[]): string {
		return totals.length === 0
			? '—'
			: totals.map((total) => formatMonetaryAmount(total.amountMinor, total.currency)).join(' · ');
	}

	function formatConvertedTotals(totals: readonly CurrencyTotal[]): string {
		if (totals.length === 0) {
			return '—';
		}
		if (conversionStatus !== 'ready') {
			return formatSourceTotals(totals);
		}

		let convertedAmountMinor = 0;
		for (const total of totals) {
			const conversionRate = conversionRates.get(total.currency);
			if (conversionRate === undefined) {
				return formatSourceTotals(totals);
			}
			const converted = convertAmountMinor(total.amountMinor, total.currency, summaryCurrency, conversionRate);
			if (converted === null) {
				return formatSourceTotals(totals);
			}
			convertedAmountMinor += converted;
		}
		return Number.isSafeInteger(convertedAmountMinor)
			? formatMonetaryAmount(convertedAmountMinor, summaryCurrency)
			: formatSourceTotals(totals);
	}

	function expenseDraft(expense: Expense): ExpenseDraft {
		return {
			amount: amountInputValue(expense.amountMinor, expense.currency),
			availableForItemCosts: expense.availableForItemCosts,
			category: expense.category,
			currency: expense.currency,
			id: expense.id,
			note: expense.note ?? '',
			paid: expense.status === 'paid',
			paidDate: expense.status === 'paid' ? expense.paidDate : '',
			title: expense.title,
			useDate: expense.useDate ?? ''
		};
	}

	function beginCreatingExpense(): void {
		if (!canStartExpenseAction) {
			return;
		}
		expenseError = null;
		expenseEditorMode = 'create';
		editingExpense = {
			amount: '',
			availableForItemCosts: false,
			category: 'misc',
			currency: data.trip.itinerary.localCurrency,
			id: crypto.randomUUID(),
			note: '',
			paid: false,
			paidDate: '',
			title: '',
			useDate: ''
		};
	}

	function beginEditingExpense(expense: Expense): void {
		if (!canStartExpenseAction) {
			return;
		}
		expenseError = null;
		expenseEditorMode = 'edit';
		editingExpense = expenseDraft(expense);
	}

	function dismissExpenseEditor(): void {
		if (!expenseSaving) {
			expenseEditorMode = null;
			editingExpense = null;
			expenseError = null;
		}
	}

	function optionalText(value: string): string | undefined {
		const trimmed = value.trim();
		return trimmed === '' ? undefined : trimmed;
	}

	function expenseCandidate(draft: ExpenseDraft): unknown | null {
		const amountMinor = amountMinorFromInput(draft.amount, draft.currency);
		if (amountMinor === null || amountMinor === 0) {
			expenseError = `Enter a positive ${draft.currency} amount with the supported number of decimal places.`;
			return null;
		}
		const note = optionalText(draft.note);
		return {
			amountMinor,
			availableForItemCosts: draft.availableForItemCosts,
			category: draft.category,
			currency: draft.currency,
			id: draft.id,
			...(note ? { note } : {}),
			...(draft.paid ? { paidDate: draft.paidDate } : {}),
			status: draft.paid ? 'paid' : 'unpaid',
			title: draft.title.trim(),
			...(draft.useDate ? { useDate: draft.useDate } : {})
		};
	}

	function errorMessage(responseData: unknown, fallback: string): string {
		const parsed = apiErrorSchema.safeParse(responseData);
		return parsed.success ? parsed.data.message : fallback;
	}

	async function saveExpense(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const editorMode = expenseEditorMode;
		if (!editingExpense || !editorMode || expenseSaving || deletingExpenseId !== null) {
			return;
		}
		const expense = expenseCandidate(editingExpense);
		if (!expense) {
			return;
		}
		const payload = expenseSaveRequestSchema.safeParse({ expense, revision: data.trip.revision });
		if (!payload.success) {
			expenseError = 'Check the expense name, dates, and amount.';
			return;
		}

		expenseSaving = true;
		expenseError = null;
		try {
			const response = await fetch(expensesEndpoint, {
				method: editorMode === 'create' ? 'POST' : 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload.data)
			});
			const responseData: unknown = await response.json().catch(() => null);
			if (!response.ok || !editSaveResponseSchema.safeParse(responseData).success) {
				expenseError = errorMessage(responseData, 'The expense could not be saved.');
				return;
			}
			expenseEditorMode = null;
			editingExpense = null;
			await invalidateAll();
			refreshOfflineTripPage();
		} catch {
			expenseError = 'The expense could not be saved because the server is unavailable.';
		} finally {
			expenseSaving = false;
		}
	}

	async function deleteExpense(expense: Expense): Promise<void> {
		if (!canStartExpenseAction || !window.confirm(`Delete “${expense.title}”?`)) {
			return;
		}
		const payload = expenseDeleteRequestSchema.safeParse({ expenseId: expense.id, revision: data.trip.revision });
		if (!payload.success) {
			expenseError = 'The expense could not be deleted.';
			return;
		}

		deletingExpenseId = expense.id;
		expenseError = null;
		try {
			const response = await fetch(expensesEndpoint, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload.data)
			});
			const responseData: unknown = await response.json().catch(() => null);
			if (!response.ok || !editSaveResponseSchema.safeParse(responseData).success) {
				expenseError = errorMessage(responseData, 'The expense could not be deleted.');
				return;
			}
			await invalidateAll();
			refreshOfflineTripPage();
		} catch {
			expenseError = 'The expense could not be deleted because the server is unavailable.';
		} finally {
			deletingExpenseId = null;
		}
	}

	async function loadConversionRates(
		controller: AbortController,
		sourceCurrencyValues: readonly CurrencyCode[],
		targetCurrency: CurrencyCode
	): Promise<void> {
		if (sourceCurrencyValues.length === 0) {
			conversionRates = new Map();
			conversionEffectiveDate = null;
			conversionError = null;
			conversionStatus = 'ready';
			return;
		}

		conversionStatus = 'loading';
		conversionError = null;
		conversionEffectiveDate = null;
		const query = new SvelteURLSearchParams({ target: targetCurrency });
		for (const sourceCurrency of sourceCurrencyValues) {
			query.append('source', sourceCurrency);
		}
		try {
			const response = await fetch(`${conversionEndpoint}?${query}`, {
				cache: 'no-store',
				signal: controller.signal
			});
			const responseData: unknown = await response.json().catch(() => null);
			const conversion = currencyConversionRatesResponseSchema.safeParse(responseData);
			if (controller.signal.aborted) {
				return;
			}
			if (!response.ok || !conversion.success || conversion.data.targetCurrency !== targetCurrency) {
				conversionStatus = 'unavailable';
				conversionError = errorMessage(responseData, 'Current exchange rates are unavailable.');
				return;
			}
			conversionRates = new Map(
				conversion.data.rates.map((rate) => [rate.sourceCurrency, rate.targetCurrencyPerSourceCurrency])
			);
			conversionEffectiveDate = conversion.data.effectiveDate;
			conversionStatus = 'ready';
		} catch {
			if (!controller.signal.aborted) {
				conversionStatus = 'unavailable';
				conversionError = 'Current exchange rates are unavailable.';
			}
		}
	}

	$effect(() => {
		const controller = new AbortController();
		void loadConversionRates(controller, sourceCurrencies, summaryCurrency);
		return () => controller.abort();
	});
</script>

{#snippet expenseEditor()}
	{#if editingExpense && expenseEditorMode}
		<form class="expense-editor" onsubmit={saveExpense}>
			<div class="expense-editor-heading">
				<div>
					<p class="eyebrow">{expenseEditorMode === 'create' ? 'New expense' : 'Edit expense'}</p>
					<h3>{expenseEditorMode === 'create' ? 'Add an expense' : editingExpense.title || 'Untitled expense'}</h3>
				</div>
				<button disabled={expenseSaving} onclick={dismissExpenseEditor} type="button">Close</button>
			</div>
			<div class="expense-editor-fields">
				<label>
					Name
					<input bind:value={editingExpense.title} disabled={expenseSaving} required />
				</label>
				<label>
					Category
					<select bind:value={editingExpense.category} disabled={expenseSaving}>
						{#each categoryOptions as category (category)}
							<option value={category}>{expenseCategoryLabels[category]}</option>
						{/each}
					</select>
				</label>
				<label>
					Amount
					<input
						bind:value={editingExpense.amount}
						disabled={expenseSaving}
						inputmode="decimal"
						placeholder="0.00"
						required
					/>
				</label>
				<label>
					Currency
					<select bind:value={editingExpense.currency} disabled={expenseSaving}>
						{#each currencyOptions as currency (currency)}
							<option value={currency}>{currency}</option>
						{/each}
					</select>
				</label>
				<label>
					Use date <span class="field-hint">Optional</span>
					<input bind:value={editingExpense.useDate} disabled={expenseSaving} type="date" />
				</label>
				<label class="paid-control">
					<input bind:checked={editingExpense.paid} disabled={expenseSaving} type="checkbox" />
					Paid
				</label>
				<label class="paid-control availability-control">
					<input bind:checked={editingExpense.availableForItemCosts} disabled={expenseSaving} type="checkbox" />
					<span>
						Available for itinerary items
						<span class="field-hint">Can be linked from an item’s Cost section.</span>
					</span>
				</label>
				{#if editingExpense.paid}
					<label>
						Paid date
						<input bind:value={editingExpense.paidDate} disabled={expenseSaving} required type="date" />
					</label>
				{/if}
				<label class="note-field">
					Note <span class="field-hint">Optional</span>
					<textarea bind:value={editingExpense.note} disabled={expenseSaving} rows="3"></textarea>
				</label>
			</div>
			{#if expenseError}<p class="error" role="alert">{expenseError}</p>{/if}
			<div class="expense-editor-actions">
				<button class="primary-button" disabled={expenseSaving} type="submit">
					{expenseSaving ? 'Saving…' : expenseEditorMode === 'create' ? 'Add expense' : 'Save expense'}
				</button>
				<button disabled={expenseSaving} onclick={dismissExpenseEditor} type="button">Cancel</button>
			</div>
		</form>
	{/if}
{/snippet}

<svelte:head>
	<title>Costs · {data.trip.itinerary.title} · Shiori</title>
	<meta name="description" content={`Costs for ${data.trip.itinerary.title}.`} />
</svelte:head>

<main>
	<header>
		<nav aria-label="Trip">
			<a href={itineraryHref}>Itinerary</a>
			<span aria-current="page">Costs</span>
			<a href={notesHref}>Notes</a>
			{#if data.currentUser}
				<span>Signed as {data.currentUser.username}</span>
				<form action="/logout" method="POST" onsubmit={clearOfflineTripPages}>
					<button type="submit">Sign out</button>
				</form>
			{/if}
		</nav>
		<p class="eyebrow">{data.trip.itinerary.title}</p>
		<h1>Costs</h1>
		<p class="introduction">Track booked costs alongside flexible expenses for purchases, passes, and package deals.</p>
	</header>

	<div class="content">
		<section aria-labelledby="summary-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Overview</p>
					<h2 id="summary-heading">Expense summary</h2>
				</div>
				<label class="currency-picker">
					<span>Display currency</span>
					<select bind:value={summaryCurrency}>
						{#each currencyOptions as currency (currency)}
							<option value={currency}>{currency}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="table-scroller">
				<table>
					<thead>
						<tr><th scope="col">Category</th><th scope="col">Paid</th><th scope="col">Unpaid</th></tr>
					</thead>
					<tbody>
						{#each overview.categories as category (category.category)}
							<tr>
								<th scope="row">{category.label}</th>
								<td>{formatConvertedTotals(category.paid)}</td>
								<td>{formatConvertedTotals(category.unpaid)}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr
							><th scope="row">Total</th><td>{formatConvertedTotals(overview.paid)}</td><td
								>{formatConvertedTotals(overview.unpaid)}</td
							></tr
						>
					</tfoot>
				</table>
			</div>
			<p class="table-note">
				{#if conversionStatus === 'loading'}
					Updating summary with current exchange rates…
				{:else if conversionStatus === 'unavailable'}
					{conversionError} Showing the original currencies instead.
				{:else if conversionEffectiveDate}
					Converted to {summaryCurrency} using ECB reference rates from {formatCalendarDate(conversionEffectiveDate) ??
						conversionEffectiveDate}.
				{:else}
					No costs have been entered yet.
				{/if}
			</p>
		</section>

		<section aria-labelledby="expenses-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Daily spending</p>
					<h2 id="expenses-heading">Expenses</h2>
				</div>
				{#if data.trip.canEdit}<button
						class="primary-button"
						disabled={!canStartExpenseAction}
						onclick={beginCreatingExpense}
						type="button">Add expense</button
					>{/if}
			</div>
			<p class="section-introduction">
				Each expense can be a single purchase or a grouped cost, such as a day of food or a rail pass.
			</p>
			{#if expenseError && expenseEditorMode === null}<p class="error" role="alert">{expenseError}</p>{/if}
			<div class="table-scroller">
				<table class="expenses-table">
					<thead>
						<tr
							><th scope="col">Expense</th><th scope="col">Category</th><th scope="col">Amount</th><th scope="col"
								>Use date</th
							><th scope="col">Status</th>{#if data.trip.canEdit}<th scope="col"
									><span class="visually-hidden">Actions</span></th
								>{/if}</tr
						>
					</thead>
					<tbody>
						{#if expenses.length === 0 && expenseEditorMode !== 'create'}
							<tr><td class="empty-cell" colspan={data.trip.canEdit ? 6 : 5}>No expenses recorded yet.</td></tr>
						{/if}
						{#if expenseEditorMode === 'create'}
							<tr class="expense-editor-row"><td colspan={data.trip.canEdit ? 6 : 5}>{@render expenseEditor()}</td></tr>
						{/if}
						{#each expenses as expense (expense.id)}
							<tr>
								<th scope="row"
									><span class="expense-title">{expense.title}</span>{#if expense.note}<span class="expense-note"
											>{expense.note}</span
										>{/if}</th
								>
								<td>{expenseCategoryLabels[expense.category]}</td>
								<td>{formatMonetaryAmount(expense.amountMinor, expense.currency)}</td>
								<td>{expense.useDate ? (formatCalendarDate(expense.useDate) ?? expense.useDate) : '—'}</td>
								<td>
									{expense.status === 'paid'
										? `Paid · ${formatCalendarDate(expense.paidDate) ?? expense.paidDate}`
										: 'Unpaid'}
									{#if expense.availableForItemCosts}<span class="expense-availability">Available to items</span>{/if}
								</td>
								{#if data.trip.canEdit}
									<td class="expense-actions">
										<button
											aria-expanded={editingExpense?.id === expense.id}
											disabled={!canStartExpenseAction}
											onclick={() => beginEditingExpense(expense)}
											type="button">Edit</button
										>
										<button disabled={!canStartExpenseAction} onclick={() => void deleteExpense(expense)} type="button"
											>{deletingExpenseId === expense.id ? 'Deleting…' : 'Delete'}</button
										>
									</td>
								{/if}
							</tr>
							{#if expenseEditorMode === 'edit' && editingExpense?.id === expense.id}
								<tr class="expense-editor-row"
									><td colspan={data.trip.canEdit ? 6 : 5}>{@render expenseEditor()}</td></tr
								>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
			{#if !data.trip.canEdit}<p class="table-note">Only the trip owner can add or edit expenses.</p>{/if}
		</section>
	</div>
</main>

<style>
	main {
		padding-bottom: clamp(2rem, 5vw, 4rem);
	}
	header {
		border-bottom: 1px solid var(--color-border-default);
		padding: clamp(3rem, 7vw, 5rem) 1rem 2rem;
		text-align: center;
	}
	nav {
		align-items: center;
		background: var(--color-surface-page);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.8125rem;
		gap: 0.375rem;
		justify-content: end;
		max-width: calc(100vw - 6.5rem);
		position: fixed;
		right: 5.75rem;
		top: 1rem;
		z-index: 1;
	}
	nav a,
	nav button,
	nav span[aria-current] {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		font: inherit;
		padding: 0.25rem 0.5rem;
		text-decoration: none;
	}
	nav span[aria-current] {
		border-color: var(--color-border-strong);
	}
	nav button,
	.expense-actions button,
	.expense-editor button,
	.primary-button {
		cursor: pointer;
	}
	nav form {
		margin: 0;
	}
	nav a:focus-visible,
	nav button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	textarea:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}
	h1,
	h2,
	h3,
	p {
		margin-top: 0;
	}
	h1 {
		font-size: clamp(2.75rem, 9vw, 5rem);
		letter-spacing: -0.05em;
		line-height: 1;
		margin-bottom: 0.75rem;
	}
	h2 {
		font-size: 1.25rem;
		margin-bottom: 0;
	}
	h3 {
		font-size: 1rem;
		margin-bottom: 0;
	}
	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin-bottom: 0.375rem;
		text-transform: uppercase;
	}
	.introduction {
		color: var(--color-text-secondary);
		margin: 0 auto;
		max-width: 38rem;
	}
	.content {
		margin: 0 auto;
		padding: 1.5rem 1rem;
		width: min(100%, 64rem);
	}
	section + section {
		margin-top: 2.5rem;
	}
	.section-heading {
		align-items: end;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.table-note,
	.section-introduction {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}
	.table-note,
	.section-introduction {
		margin: 0.625rem 0 0;
	}
	.currency-picker {
		align-items: center;
		color: var(--color-text-muted);
		display: flex;
		font-size: 0.875rem;
		gap: 0.5rem;
		white-space: nowrap;
	}
	.currency-picker select,
	.expense-editor input,
	.expense-editor select,
	.expense-editor textarea {
		background: var(--color-surface-page);
		border: 1px solid var(--color-border-strong);
		border-radius: 0;
		color: var(--color-text-primary);
		font: inherit;
		padding: 0.375rem 0.5rem;
		width: 100%;
	}
	.currency-picker select {
		padding: 0.25rem 0.375rem;
		width: auto;
	}
	.table-scroller {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		min-width: 32rem;
		width: 100%;
	}
	th,
	td {
		border: 1px solid var(--color-border-default);
		padding: 0.625rem 0.75rem;
		text-align: left;
		vertical-align: middle;
	}
	thead,
	tfoot {
		background: var(--color-surface-subtle);
	}
	tbody th,
	tfoot th {
		font-weight: 600;
	}
	.expenses-table {
		min-width: 52rem;
	}
	.expense-title,
	.expense-note {
		display: block;
	}
	.expense-note {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 400;
		margin-top: 0.25rem;
		white-space: pre-wrap;
	}
	.expense-availability {
		color: var(--color-text-muted);
		display: block;
		font-size: 0.75rem;
		margin-top: 0.25rem;
	}
	.expense-actions {
		display: flex;
		gap: 0.375rem;
	}
	.expense-actions button,
	.expense-editor button {
		background: transparent;
		border: 1px solid var(--color-border-strong);
		color: inherit;
		font: inherit;
		padding: 0.375rem 0.625rem;
	}
	.expense-actions button:disabled,
	.expense-editor button:disabled {
		color: var(--color-text-muted);
		cursor: not-allowed;
	}
	.primary-button {
		background: var(--color-text-primary);
		border: 1px solid var(--color-text-primary);
		color: var(--color-surface-page);
		font: inherit;
		padding: 0.375rem 0.625rem;
	}
	.primary-button:disabled {
		cursor: progress;
		opacity: 0.7;
	}
	.empty-cell {
		color: var(--color-text-muted);
		padding: 1rem;
		text-align: center;
	}
	.expense-editor-row td {
		background: var(--color-surface-subtle);
		padding: 0;
	}
	.expense-editor {
		padding: 1rem;
	}
	.expense-editor-heading,
	.expense-editor-actions {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
	}
	.expense-editor-heading {
		margin-bottom: 1rem;
	}
	.expense-editor-fields {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.expense-editor-fields label {
		display: grid;
		font-size: 0.875rem;
		gap: 0.375rem;
	}
	.expense-editor-fields .paid-control {
		align-items: center;
		display: flex;
		gap: 0.5rem;
		padding-top: 1.5rem;
	}
	.expense-editor-fields .paid-control input {
		width: auto;
	}
	.expense-editor-fields .availability-control {
		align-items: start;
	}
	.availability-control .field-hint {
		display: block;
		margin-top: 0.25rem;
	}
	.expense-editor-fields .note-field {
		grid-column: 1 / -1;
	}
	.expense-editor textarea {
		resize: vertical;
	}
	.expense-editor-actions {
		justify-content: end;
		margin-top: 1rem;
	}
	.error {
		background: color-mix(in srgb, var(--color-state-error) 15%, var(--color-surface-raised));
		border: 1px solid var(--color-state-error);
		margin: 0.75rem 0 0;
		padding: 0.625rem 0.75rem;
	}
	.field-hint {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 400;
	}
	.visually-hidden {
		clip: rect(0, 0, 0, 0);
		height: 1px;
		margin: -1px;
		overflow: hidden;
		padding: 0;
		position: absolute;
		white-space: nowrap;
		width: 1px;
	}
	@media (max-width: 32rem) {
		nav {
			right: 4.75rem;
			top: 0.5rem;
		}
		header {
			padding-top: 4.5rem;
		}
		.section-heading {
			align-items: start;
			flex-direction: column;
			gap: 0.25rem;
		}
		.currency-picker {
			align-self: flex-start;
		}
		.expense-editor-fields {
			grid-template-columns: 1fr;
		}
		.expense-editor-fields .note-field {
			grid-column: auto;
		}
		.expense-editor-fields .paid-control {
			padding-top: 0;
		}
	}
</style>
