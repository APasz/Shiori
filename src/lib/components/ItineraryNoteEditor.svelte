<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		apiErrorSchema,
		editSaveResponseSchema,
		noteDeleteRequestSchema,
		noteSaveRequestSchema
	} from '$lib/editing/contracts';
	import { formatCalendarDate } from '$lib/itinerary/calendar';
	import {
		currencyCodeSchema,
		noteEntryStateSchema,
		type CurrencyCode,
		type ItineraryNote,
		type ItineraryNoteTarget,
		type NoteEntryState
	} from '$lib/itinerary/schema';
	import { browserTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { amountInputValue, amountMinorFromInput } from '$lib/money';
	import TimePicker from './TimePicker.svelte';
	import TimeZonePicker from './TimeZonePicker.svelte';

	type EditorState = 'editing' | 'saving' | 'deleting';
	type EstimatedCostDraft = {
		amount: string;
		currency: CurrencyCode;
		id: string;
		label: string;
	};
	type LinkDraft = {
		id: string;
		name: string;
		url: string;
	};
	type EntryDraft = {
		estimatedCosts: EstimatedCostDraft[];
		id: string;
		links: LinkDraft[];
		note: string;
		state: NoteEntryState;
		endTime: string;
		startTime: string;
		title: string;
	};

	let {
		defaultTimeZone,
		initialNote,
		localCurrency,
		notesEndpoint,
		onDismiss,
		onSaved,
		revision,
		target
	}: {
		defaultTimeZone: string;
		initialNote: ItineraryNote | undefined;
		localCurrency: CurrencyCode;
		notesEndpoint: string;
		onDismiss: () => void;
		onSaved: () => Promise<void>;
		revision: number;
		target: ItineraryNoteTarget;
	} = $props();

	let dialogElement: HTMLDialogElement;
	let text = $state('');
	let timeZone = $state('UTC');
	let entries = $state<EntryDraft[]>([]);
	let timeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	let editorState = $state<EditorState>('editing');
	let errorMessage = $state('');
	let initialDraftFingerprint = $state<string | null>(null);

	const stateOptions = noteEntryStateSchema.options;
	const currencyOptions = currencyCodeSchema.options;
	const targetTitle = $derived(
		target.kind === 'trip' ? 'Trip notes' : (formatCalendarDate(target.date) ?? target.date)
	);
	const targetDescription = $derived(
		target.kind === 'trip'
			? 'Ideas, budgets, and plans that span the whole trip.'
			: 'Keep alternatives, estimates, and reminders for this day.'
	);
	const draftFingerprint = $derived(JSON.stringify({ entries, text, timeZone }));
	const hasUnsavedChanges = $derived(initialDraftFingerprint !== null && draftFingerprint !== initialDraftFingerprint);

	function entryDraft(entry: ItineraryNote['entries'][number]): EntryDraft {
		return {
			estimatedCosts: entry.estimatedCosts.map((estimatedCost) => ({
				amount: amountInputValue(estimatedCost.amountMinor, estimatedCost.currency),
				currency: estimatedCost.currency,
				id: estimatedCost.id,
				label: estimatedCost.label ?? ''
			})),
			id: entry.id,
			links: entry.links.map((link, index) => ({
				id: `${entry.id}-link-${index}`,
				name: link.label,
				url: link.url
			})),
			note: entry.note ?? '',
			state: entry.state,
			endTime: entry.endTime ?? '',
			startTime: entry.startTime ?? '',
			title: entry.title
		};
	}

	function populateDraft(): void {
		if (!initialNote) {
			timeZone = defaultTimeZone;
			return;
		}
		text = initialNote.text;
		timeZone = initialNote.timeZone;
		entries = initialNote.entries.map(entryDraft);
	}

	function optionalText(value: string): string | undefined {
		const trimmed = value.trim();
		return trimmed === '' ? undefined : trimmed;
	}

	function estimatedCostsCandidate(entry: EntryDraft, showError: boolean): unknown[] | null {
		const estimatedCosts: unknown[] = [];
		for (const estimatedCost of entry.estimatedCosts) {
			const label = optionalText(estimatedCost.label);
			if (estimatedCost.amount.trim() === '' && label === undefined) {
				continue;
			}
			const amountMinor = amountMinorFromInput(estimatedCost.amount, estimatedCost.currency);
			if (amountMinor === null || amountMinor === 0) {
				if (showError) {
					errorMessage = `Enter a positive ${estimatedCost.currency} estimate with the supported number of decimal places.`;
				}
				return null;
			}
			estimatedCosts.push({
				amountMinor,
				currency: estimatedCost.currency,
				id: estimatedCost.id,
				...(label ? { label } : {})
			});
		}
		return estimatedCosts;
	}

	function linksCandidate(entry: EntryDraft, showError: boolean): unknown[] | null {
		const links: unknown[] = [];
		for (const link of entry.links) {
			const name = optionalText(link.name);
			const url = optionalText(link.url);
			if (name === undefined && url === undefined) {
				continue;
			}
			if (name === undefined || url === undefined) {
				if (showError) {
					errorMessage = 'Each link needs both a name and URL.';
				}
				return null;
			}
			links.push({ label: name, url });
		}
		return links;
	}

	function noteCandidate(showError: boolean): unknown | null {
		const candidateEntries: unknown[] = [];
		for (const entry of entries) {
			const estimatedCosts = estimatedCostsCandidate(entry, showError);
			if (estimatedCosts === null) {
				return null;
			}
			const links = linksCandidate(entry, showError);
			if (links === null) {
				return null;
			}
			const note = optionalText(entry.note);
			candidateEntries.push({
				estimatedCosts,
				id: entry.id,
				links,
				...(note ? { note } : {}),
				state: entry.state,
				...(entry.endTime ? { endTime: entry.endTime } : {}),
				...(entry.startTime ? { startTime: entry.startTime } : {}),
				title: entry.title.trim()
			});
		}

		return {
			entries: candidateEntries,
			kind: target.kind,
			...(target.kind === 'day' ? { date: target.date } : {}),
			text,
			timeZone
		};
	}

	function addEntry(): void {
		entries = [
			...entries,
			{
				estimatedCosts: [],
				id: crypto.randomUUID(),
				links: [],
				note: '',
				state: 'idea',
				endTime: '',
				startTime: '',
				title: ''
			}
		];
	}

	function removeEntry(entryId: string): void {
		entries = entries.filter((entry) => entry.id !== entryId);
	}

	function addEstimatedCost(entry: EntryDraft): void {
		entry.estimatedCosts = [
			...entry.estimatedCosts,
			{ amount: '', currency: localCurrency, id: crypto.randomUUID(), label: '' }
		];
	}

	function removeEstimatedCost(entry: EntryDraft, costId: string): void {
		entry.estimatedCosts = entry.estimatedCosts.filter((estimatedCost) => estimatedCost.id !== costId);
	}

	function addLink(entry: EntryDraft): void {
		entry.links = [...entry.links, { id: crypto.randomUUID(), name: '', url: '' }];
	}

	function removeLink(entry: EntryDraft, linkId: string): void {
		entry.links = entry.links.filter((link) => link.id !== linkId);
	}

	function confirmDiscard(): boolean {
		return !hasUnsavedChanges || window.confirm('Discard your unsaved note changes?');
	}

	function cancelEditing(): void {
		if (confirmDiscard()) {
			dialogElement.close();
		}
	}

	function handleDialogCancel(event: Event): void {
		if (!confirmDiscard()) {
			event.preventDefault();
		}
	}

	function errorFrom(responseData: unknown, fallback: string): string {
		const parsed = apiErrorSchema.safeParse(responseData);
		return parsed.success ? parsed.data.message : fallback;
	}

	async function readResponseData(response: Response): Promise<unknown> {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}

	async function saveNote(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (editorState !== 'editing') {
			return;
		}
		errorMessage = '';
		const note = noteCandidate(true);
		if (note === null) {
			return;
		}
		const payload = noteSaveRequestSchema.safeParse({ note, revision });
		if (!payload.success) {
			errorMessage = 'Check the note, entry titles, times, and estimates.';
			return;
		}

		editorState = 'saving';
		try {
			const response = await fetch(notesEndpoint, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload.data)
			});
			const responseData = await readResponseData(response);
			if (!response.ok || !editSaveResponseSchema.safeParse(responseData).success) {
				editorState = 'editing';
				errorMessage = errorFrom(responseData, 'The note could not be saved.');
				return;
			}
			await onSaved();
			dialogElement.close();
		} catch {
			editorState = 'editing';
			errorMessage = 'The note could not be saved because the server is unavailable.';
		}
	}

	async function deleteNote(): Promise<void> {
		if (!initialNote || editorState !== 'editing' || !window.confirm(`Delete ${targetTitle}?`)) {
			return;
		}
		const payload = noteDeleteRequestSchema.safeParse({ revision, target });
		if (!payload.success) {
			errorMessage = 'The note could not be deleted.';
			return;
		}

		editorState = 'deleting';
		errorMessage = '';
		try {
			const response = await fetch(notesEndpoint, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload.data)
			});
			const responseData = await readResponseData(response);
			if (!response.ok || !editSaveResponseSchema.safeParse(responseData).success) {
				editorState = 'editing';
				errorMessage = errorFrom(responseData, 'The note could not be deleted.');
				return;
			}
			await onSaved();
			dialogElement.close();
		} catch {
			editorState = 'editing';
			errorMessage = 'The note could not be deleted because the server is unavailable.';
		}
	}

	onMount(() => {
		timeZoneOptions = browserTimeZoneOptions();
		populateDraft();
		initialDraftFingerprint = JSON.stringify({ entries, text, timeZone });
		dialogElement.showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="note-editor-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	oncancel={handleDialogCancel}
	onclose={onDismiss}
>
	<form class="editor shiori-form" data-dialog-scroll-area onsubmit={saveNote}>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">{target.kind === 'trip' ? 'Trip notepad' : 'Day notepad'}</p>
				<h2 id="note-editor-heading">{targetTitle}</h2>
				<p class:changed={hasUnsavedChanges} class="editor-status">
					{editorState === 'saving'
						? 'Saving changes…'
						: editorState === 'deleting'
							? 'Deleting note…'
							: hasUnsavedChanges
								? 'Unsaved changes'
								: 'All changes saved'}
				</p>
			</div>
			<div class="editor-actions">
				<button class="save-button shiori-form-button" disabled={editorState !== 'editing'} type="submit">
					{editorState === 'saving' ? 'Saving…' : 'Save note'}
				</button>
				<button
					class="close-button shiori-form-button"
					disabled={editorState !== 'editing'}
					onclick={cancelEditing}
					type="button"
				>
					Cancel
				</button>
			</div>
		</header>

		<p class="introduction">{targetDescription}</p>

		<label class="shiori-form-label">
			Freeform notes
			<textarea bind:value={text} class="shiori-form-control" disabled={editorState !== 'editing'} rows="6"></textarea>
		</label>
		<label class="shiori-form-label" for="note-time-zone">
			Note time zone
			<span class="field-hint">Entry times use this time zone. It starts with the trip’s time zone.</span>
			<TimeZonePicker
				id="note-time-zone"
				onSelect={(value) => (timeZone = value)}
				options={timeZoneOptions}
				value={timeZone}
			/>
		</label>

		<section aria-labelledby="note-entries-heading" class="entries">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Planning list</p>
					<h3 id="note-entries-heading">Structured entries</h3>
				</div>
				<button
					class="add-entry shiori-form-button"
					disabled={editorState !== 'editing'}
					onclick={addEntry}
					type="button"
				>
					Add entry
				</button>
			</div>
			<p class="field-hint">Only populated fields appear when the note is viewed.</p>
			{#if entries.length === 0}
				<p class="empty-entries">No structured entries yet.</p>
			{:else}
				<div class="entry-list">
					{#each entries as entry, entryIndex (entry.id)}
						<details class="entry" open>
							<summary>
								<span>Entry {entryIndex + 1}: {entry.title || 'Untitled entry'}</span>
								<span class="entry-state">{entry.state}</span>
							</summary>
							<div class="entry-content">
								<div class="entry-heading">
									<label class="shiori-form-label">
										Title
										<input
											bind:value={entry.title}
											class="shiori-form-control"
											disabled={editorState !== 'editing'}
											required
										/>
									</label>
									<label class="shiori-form-label">
										Planning state
										<select bind:value={entry.state} class="shiori-form-control" disabled={editorState !== 'editing'}>
											{#each stateOptions as state (state)}
												<option value={state}>{state[0].toUpperCase()}{state.slice(1)}</option>
											{/each}
										</select>
									</label>
								</div>
								<label class="shiori-form-label">
									Details <span class="field-hint">Optional</span>
									<textarea
										bind:value={entry.note}
										class="shiori-form-control"
										disabled={editorState !== 'editing'}
										rows="3"></textarea>
								</label>
								<div class="time-range">
									<label class="shiori-form-label" for={`${entry.id}-start-time`}>
										Start time <span class="field-hint">Optional</span>
										<TimePicker
											id={`${entry.id}-start-time`}
											value={entry.startTime}
											onChange={(value) => (entry.startTime = value)}
										/>
									</label>
									<label class="shiori-form-label" for={`${entry.id}-end-time`}>
										End time <span class="field-hint">Optional</span>
										<TimePicker
											id={`${entry.id}-end-time`}
											value={entry.endTime}
											onChange={(value) => (entry.endTime = value)}
										/>
									</label>
								</div>
								<section
									aria-label={`Estimated costs for ${entry.title || `entry ${entryIndex + 1}`}`}
									class="estimated-costs"
								>
									<div class="cost-heading">
										<h4>Estimated costs</h4>
										<button disabled={editorState !== 'editing'} onclick={() => addEstimatedCost(entry)} type="button"
											>Add estimate</button
										>
									</div>
									{#each entry.estimatedCosts as estimatedCost (estimatedCost.id)}
										<div class="estimated-cost">
											<label class="shiori-form-label">
												Label <span class="field-hint">Optional</span>
												<input
													bind:value={estimatedCost.label}
													class="shiori-form-control"
													disabled={editorState !== 'editing'}
												/>
											</label>
											<label class="shiori-form-label">
												Amount
												<input
													bind:value={estimatedCost.amount}
													class="shiori-form-control"
													disabled={editorState !== 'editing'}
													inputmode="decimal"
												/>
											</label>
											<label class="shiori-form-label">
												Currency
												<select
													bind:value={estimatedCost.currency}
													class="shiori-form-control"
													disabled={editorState !== 'editing'}
												>
													{#each currencyOptions as currency (currency)}
														<option value={currency}>{currency}</option>
													{/each}
												</select>
											</label>
											<button
												disabled={editorState !== 'editing'}
												onclick={() => removeEstimatedCost(entry, estimatedCost.id)}
												type="button">Remove</button
											>
										</div>
									{/each}
								</section>
								<section aria-label={`Links for ${entry.title || `entry ${entryIndex + 1}`}`} class="entry-links">
									<div class="link-heading">
										<h4>Links</h4>
										<button disabled={editorState !== 'editing'} onclick={() => addLink(entry)} type="button"
											>Add link</button
										>
									</div>
									{#each entry.links as link (link.id)}
										<div class="note-link">
											<label class="shiori-form-label">
												Name
												<input
													bind:value={link.name}
													class="shiori-form-control"
													disabled={editorState !== 'editing'}
												/>
											</label>
											<label class="shiori-form-label">
												URL
												<input
													bind:value={link.url}
													class="shiori-form-control"
													disabled={editorState !== 'editing'}
													type="url"
												/>
											</label>
											<button
												disabled={editorState !== 'editing'}
												onclick={() => removeLink(entry, link.id)}
												type="button">Remove</button
											>
										</div>
									{/each}
								</section>
								<button
									class="remove-entry"
									disabled={editorState !== 'editing'}
									onclick={() => removeEntry(entry.id)}
									type="button"
								>
									Remove entry
								</button>
							</div>
						</details>
					{/each}
				</div>
			{/if}
		</section>

		{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
		{#if initialNote}
			<button class="delete-note" disabled={editorState !== 'editing'} onclick={() => void deleteNote()} type="button"
				>Delete note</button
			>
		{/if}
	</form>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-width: min(52rem, calc(100% - 2rem));
		overflow: visible;
		padding: 0;
		width: 100%;
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 88%, transparent);
	}

	.editor {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		max-height: min(50rem, calc(100vh - 2rem));
		overflow-y: auto;
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	header,
	.editor-actions,
	.section-heading,
	.entry-heading,
	.cost-heading,
	.link-heading {
		display: flex;
		gap: 1rem;
	}

	header,
	.section-heading,
	.cost-heading,
	.link-heading {
		align-items: start;
		justify-content: space-between;
	}

	.editor-actions {
		align-items: center;
		flex-shrink: 0;
	}

	.eyebrow,
	.editor-status,
	.field-hint,
	.introduction,
	.empty-entries {
		color: var(--color-text-muted);
	}

	.eyebrow {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 0 0 0.25rem;
		text-transform: uppercase;
	}

	.editor-status,
	.field-hint,
	.introduction,
	.empty-entries {
		font-size: 0.875rem;
	}

	.editor-status,
	.introduction,
	.empty-entries {
		margin: 0.5rem 0 0;
	}

	.editor-status.changed {
		color: var(--color-state-warning);
	}

	h2,
	h3,
	h4 {
		margin: 0;
	}

	h2 {
		font-size: 1.25rem;
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.875rem;
	}

	.save-button {
		background: var(--color-surface-subtle);
	}

	.close-button {
		border-color: var(--color-border-strong);
	}

	.entries {
		border-top: 1px solid var(--color-border-default);
		padding-top: 1rem;
	}

	.add-entry {
		padding-block: 0.5rem;
	}

	.entry-list {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
	}

	.entry {
		border: 1px solid var(--color-border-default);
		margin: 0;
	}

	.entry summary {
		align-items: center;
		cursor: pointer;
		display: flex;
		font-size: 0.8125rem;
		font-weight: 700;
		gap: 1rem;
		justify-content: space-between;
		padding: 1rem;
	}

	.entry summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: -3px;
	}

	.entry-state {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 400;
		text-transform: capitalize;
	}

	.entry-content {
		display: grid;
		gap: 1rem;
		padding: 0 1rem 1rem;
	}

	.entry-heading > label:first-child {
		flex: 1;
	}

	.time-range,
	.estimated-cost,
	.note-link {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.estimated-costs {
		border-top: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		padding-top: 1rem;
	}

	.entry-links {
		border-top: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		padding-top: 1rem;
	}

	.cost-heading,
	.link-heading {
		align-items: center;
	}

	.cost-heading button,
	.link-heading button,
	.estimated-cost button,
	.note-link button,
	.remove-entry,
	.delete-note {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.375rem 0.625rem;
	}

	.estimated-cost {
		align-items: end;
		grid-template-columns: minmax(0, 1fr) minmax(8rem, 0.65fr) minmax(5rem, 0.4fr) auto;
	}

	.note-link {
		align-items: end;
		grid-template-columns: minmax(0, 0.6fr) minmax(0, 1fr) auto;
	}

	.remove-entry,
	.delete-note {
		border-color: var(--color-state-error);
		color: var(--color-state-error);
		justify-self: start;
	}

	.delete-note {
		margin-top: 0.5rem;
	}

	.error {
		color: var(--color-state-error);
		margin: 0;
	}

	button:focus-visible,
	textarea:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 38rem) {
		header,
		.section-heading,
		.entry-heading,
		.estimated-cost,
		.note-link {
			align-items: stretch;
			flex-direction: column;
			grid-template-columns: 1fr;
		}

		.editor-actions {
			justify-content: end;
		}

		.time-range {
			grid-template-columns: 1fr;
		}
	}
</style>
