<script lang="ts">
	import ItineraryTime from '$lib/components/ItineraryTime.svelte';
	import ItineraryTiming from '$lib/components/ItineraryTiming.svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import { formatCalendarDate } from '$lib/itinerary/calendar';
	import { resolveLinkedExpenses } from '$lib/itinerary/expenses';
	import {
		itemLocationFlow,
		shouldShowTransportStopSchedule,
		transportTravelDuration
	} from '$lib/itinerary/item-location-flow';
	import type { Cost, CurrencyCode, Expense, ItineraryItem, ItineraryLocation } from '$lib/itinerary/schema';
	import { resolveTimingTimeZone } from '$lib/itinerary/time-zone';
	import { formatMonetaryAmount } from '$lib/money';
	import { itemTypeAccentStyle, reservationStatusStyle } from '$lib/theme/palette';
	import { onMount } from 'svelte';

	let {
		item,
		expenses,
		localCurrency,
		tripTimeZone,
		canEdit,
		mutationError,
		isDeleting,
		isMarkingCostPaid,
		onDismiss,
		onDelete,
		onMarkCostPaid,
		onEdit
	}: {
		item: ItineraryItem;
		expenses: readonly Expense[];
		localCurrency: CurrencyCode;
		tripTimeZone: string;
		canEdit: boolean;
		mutationError: string | null;
		isDeleting: boolean;
		isMarkingCostPaid: boolean;
		onDismiss: () => void;
		onDelete: () => void;
		onMarkCostPaid: () => void;
		onEdit: () => void;
	} = $props();
	let dialogElement: HTMLDialogElement;
	const timingTimeZone = $derived(resolveTimingTimeZone(item.timing, tripTimeZone));
	const linkedExpenses = $derived(resolveLinkedExpenses(expenses, item.linkedExpenseIds));
	const locationFlow = $derived(itemLocationFlow(item, tripTimeZone));
	const hasEndTime = $derived(item.timing.kind === 'exact' && item.timing.endAt !== undefined);
	const startLabel = $derived(item.type === 'accommodation' ? 'Check-in' : 'Start');
	const endLabel = $derived(item.type === 'accommodation' ? 'Check-out' : 'End');

	onMount(() => {
		dialogElement.showModal();
	});

	function startEditing(): void {
		dialogElement.close();
		onEdit();
	}

	function locationLabel(location: ItineraryLocation): string {
		return location.code ? `${location.name} (${location.code})` : location.name;
	}

	function locationMapUrl(location: ItineraryLocation): string | undefined {
		return location.googleMapsUrl ?? location.openRailwayMapUrl;
	}

	function paidAtLabel(paidAt: number): string {
		return new Intl.DateTimeFormat(undefined, {
			day: '2-digit',
			hour: 'numeric',
			minute: '2-digit',
			month: 'short',
			weekday: 'short',
			year: 'numeric'
		}).format(paidAt);
	}

	function exchangeRateLabel(exchangeRate: number): string {
		return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 8 }).format(exchangeRate);
	}

	function costStatusLabel(cost: Cost): 'Paid' | 'Scheduled' | 'Unpaid' {
		if (cost.status === 'paid') {
			return 'Paid';
		}
		return cost.scheduledPaymentDate ? 'Scheduled' : 'Unpaid';
	}
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="item-details-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	onclose={() => onDismiss()}
	style={itemTypeAccentStyle(item.type)}
>
	<div class="details" data-dialog-scroll-area>
		<div aria-hidden="true" class="drag-handle" data-dialog-drag-handle></div>
		<div class="heading">
			<div>
				<p class="eyebrow">{item.type}</p>
				<h2 id="item-details-heading">{item.title}</h2>
			</div>
			<div class="heading-actions">
				{#if canEdit}
					<button class="edit-button" onclick={startEditing} type="button">Edit</button>
				{/if}
				<form method="dialog">
					<button class="close-button" type="submit">Close</button>
				</form>
			</div>
		</div>

		<section aria-label={item.type === 'transport' ? 'Journey' : 'Schedule'}>
			{#if item.type !== 'transport'}<h3>Schedule</h3>{/if}
			<div class="item-flow">
				<div class="timing-boundary">
					{#if item.type !== 'transport'}<span class="timing-boundary-label">{startLabel}</span>{/if}
					<ItineraryTiming
						calendarDateFormat="date-with-weekday"
						display="start"
						includeDate
						timing={item.timing}
						timeZone={timingTimeZone}
					/>
				</div>

				{#if locationFlow.length > 0}
					<ol aria-label="Locations and travel times" class="location-flow">
						{#each locationFlow as entry, locationIndex (entry.location.id)}
							{@const mapUrl = locationMapUrl(entry.location)}
							{@const travelDuration = transportTravelDuration(locationFlow[locationIndex - 1], entry)}
							{#if travelDuration}
								<li class="travel-duration">Travel time: {travelDuration}</li>
							{/if}
							<li>
								{#if mapUrl}
									<strong>
										<a href={mapUrl} rel="external noopener noreferrer" target="_blank">
											{locationLabel(entry.location)}
										</a>
									</strong>
								{:else}
									<strong>{locationLabel(entry.location)}</strong>
								{/if}

								{#if entry.kind === 'transport-stop'}
									{#if entry.schedule && shouldShowTransportStopSchedule(entry, locationIndex, item.timing)}
										<span class="location-time">
											<ItineraryTime
												calendarDateFormat="date-with-weekday"
												includeDate
												startAt={entry.schedule.scheduledAt}
												timeZone={entry.schedule.timeZone}
											/>
										</span>
									{/if}
									{#if entry.platform}<span>Platform {entry.platform}</span>{/if}
								{:else if item.type !== 'accommodation'}
									<span class="location-time">
										<span class="location-time-label">At</span>
										<ItineraryTiming
											calendarDateFormat="date-with-weekday"
											display="start"
											includeDate
											timing={item.timing}
											timeZone={timingTimeZone}
										/>
									</span>
								{/if}

								{#if entry.location.address}<span>{entry.location.address}</span>{/if}
								{#if entry.location.googleMapsUrl && entry.location.openRailwayMapUrl}
									<a
										class="location-map-link"
										href={entry.location.openRailwayMapUrl}
										rel="external noopener noreferrer"
										target="_blank"
									>
										OpenRailwayMap
									</a>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}

				{#if hasEndTime}
					<div class="timing-boundary">
						{#if item.type !== 'transport'}<span class="timing-boundary-label">{endLabel}</span>{/if}
						<ItineraryTiming
							calendarDateFormat="date-with-weekday"
							display="end"
							includeDate
							timing={item.timing}
							timeZone={timingTimeZone}
						/>
					</div>
				{/if}
			</div>
		</section>

		{#if item.type === 'transport'}
			<section aria-labelledby="transport-heading">
				<h3 id="transport-heading">Transport</h3>
				<dl>
					<dt>Mode</dt>
					<dd>{item.transport.mode.replace('-', ' ')}</dd>
					{#if item.transport.operator}
						<dt>Operator</dt>
						<dd>{item.transport.operator}</dd>
					{/if}
					{#if item.transport.serviceNumber}
						<dt>Service</dt>
						<dd>{item.transport.serviceNumber}</dd>
					{/if}
					{#if item.transport.seat}
						<dt>Seat</dt>
						<dd>{item.transport.seat}</dd>
					{/if}
				</dl>
			</section>
		{/if}

		{#if item.reservation}
			<section aria-labelledby="reservation-heading">
				<h3 id="reservation-heading">Reservation</h3>
				<dl>
					<dt>Status</dt>
					<dd class="reservation-status" style={reservationStatusStyle(item.reservation.status)}>
						{item.reservation.status}
					</dd>
					{#if item.reservation.provider}
						<dt>Provider</dt>
						<dd>{item.reservation.provider}</dd>
					{/if}
					{#if item.reservation.reference}
						<dt>Reference</dt>
						<dd>{item.reservation.reference}</dd>
					{/if}
				</dl>
			</section>
		{/if}

		{#if item.cost}
			<section aria-labelledby="cost-heading">
				<h3 id="cost-heading">Cost</h3>
				<div class="cost-summary">
					<div class="cost-primary">
						<strong class="cost-amount">{formatMonetaryAmount(item.cost.amountMinor, item.cost.currency)}</strong>
						<span class:paid={item.cost.status === 'paid'} class="cost-status">
							{costStatusLabel(item.cost)}
						</span>
					</div>

					{#if item.cost.status === 'paid'}
						{#if item.cost.payment.localCurrency !== item.cost.currency}
							<p class="cost-local-equivalent">
								≈ {formatMonetaryAmount(item.cost.payment.localAmountMinor, item.cost.payment.localCurrency)}
							</p>
							<p class="cost-payment-detail">
								Paid {paidAtLabel(item.cost.payment.paidAt)} · Rate on {formatCalendarDate(
									item.cost.payment.rateDate,
									'date-with-weekday'
								)}
							</p>
							<p class="cost-rate">
								1 {item.cost.currency} = {exchangeRateLabel(item.cost.payment.exchangeRate)}
								{item.cost.payment.localCurrency}
							</p>
						{:else}
							<p class="cost-payment-detail">Paid {paidAtLabel(item.cost.payment.paidAt)}</p>
						{/if}
						{#if item.cost.payment.localCurrency !== localCurrency}
							<p class="cost-note">Trip currency is now {localCurrency}.</p>
						{/if}
					{:else if item.cost.scheduledPaymentDate}
						<p class="cost-payment-detail">
							Due {formatCalendarDate(item.cost.scheduledPaymentDate, 'date-with-weekday')}
						</p>
					{/if}
				</div>
			</section>
		{/if}

		{#if linkedExpenses.length > 0}
			<section aria-labelledby="linked-expenses-heading">
				<h3 id="linked-expenses-heading">Linked expenses</h3>
				<ul>
					{#each linkedExpenses as expense (expense.id)}
						<li>
							<strong>{expense.title}</strong>
							<span>{expense.category}</span>
							<span>{formatMonetaryAmount(expense.amountMinor, expense.currency)}</span>
							<span>{expense.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if item.notes.length > 0}
			<section aria-labelledby="notes-heading">
				<h3 id="notes-heading">Notes</h3>
				<ul>
					{#each item.notes as note (note)}
						<li>{note}</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if item.links.length > 0}
			<section aria-labelledby="links-heading">
				<h3 id="links-heading">Links</h3>
				<ul>
					{#each item.links as link (link.url)}
						<li>
							<a href={link.url} rel="external noopener noreferrer" target="_blank">
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if item.documents.length > 0}
			<section aria-labelledby="documents-heading">
				<h3 id="documents-heading">Documents</h3>
				<ul>
					{#each item.documents as document (document.title)}
						<li>
							<a href={document.url} rel="external noopener noreferrer" target="_blank">
								{document.title}
							</a>
							<span class="document-kind">{document.kind}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if canEdit}
			<div class="details-actions">
				{#if mutationError}<p class="mutation-error" role="alert">{mutationError}</p>{/if}
				<div class="details-action-buttons">
					{#if item.cost?.status === 'unpaid' && item.cost.scheduledPaymentDate}
						<button
							class="mark-cost-paid-button"
							disabled={isDeleting || isMarkingCostPaid}
							onclick={onMarkCostPaid}
							type="button"
						>
							{isMarkingCostPaid ? 'Marking cost paid…' : 'Mark cost paid'}
						</button>
					{/if}
					<button class="delete-button" disabled={isDeleting || isMarkingCostPaid} onclick={onDelete} type="button">
						{isDeleting ? 'Deleting item…' : 'Delete item'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-height: calc(100dvh - 2rem);
		max-width: min(44rem, calc(100% - 2rem));
		padding: 0;
		width: 100%;
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 88%, transparent);
	}

	.details {
		background: var(--color-surface-raised);
		border: 1px solid var(--item-accent);
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	.drag-handle {
		align-items: center;
		display: flex;
		height: 0.75rem;
		justify-content: center;
		margin: -0.5rem 0 0.75rem;
	}

	.drag-handle::before {
		background: var(--color-border-strong);
		border-radius: 999px;
		content: '';
		height: 0.25rem;
		width: 2.5rem;
	}

	.heading,
	.heading-actions {
		display: flex;
		gap: 1rem;
	}

	.heading {
		align-items: start;
		justify-content: space-between;
	}

	.heading-actions {
		align-items: center;
		flex-shrink: 0;
	}

	.eyebrow {
		color: var(--item-accent);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.document-kind,
	.location-map-link,
	.cost-note,
	.location-time-label,
	.timing-boundary-label {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.location-map-link {
		width: fit-content;
	}

	.cost-note {
		font-size: 0.625rem;
		letter-spacing: 0.04em;
		margin: 0.125rem 0 0;
	}

	.eyebrow {
		margin: 0 0 0.25rem;
	}

	h2,
	h3 {
		margin-top: 0;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 0;
	}

	h3 {
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.close-button,
	.edit-button,
	.delete-button,
	.mark-cost-paid-button {
		background: transparent;
		border: 1px solid currentColor;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.375rem 0.625rem;
	}

	.close-button:hover,
	.edit-button:hover {
		background: var(--color-surface-subtle);
	}

	.close-button:focus-visible,
	.edit-button:focus-visible,
	.delete-button:focus-visible,
	.mark-cost-paid-button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	section {
		margin-top: 1.5rem;
	}

	.item-flow,
	.timing-boundary,
	.location-time {
		display: grid;
		gap: 0.25rem;
	}

	.cost-summary {
		display: grid;
		gap: 0.375rem;
	}

	.cost-primary {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
	}

	.cost-amount {
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
	}

	.cost-status {
		border: 1px solid var(--color-state-warning);
		color: var(--color-state-warning);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.375rem;
		text-transform: uppercase;
	}

	.cost-status.paid {
		border-color: var(--color-state-success);
		color: var(--color-state-success);
	}

	.cost-local-equivalent,
	.cost-payment-detail,
	.cost-rate {
		margin: 0;
	}

	.cost-local-equivalent {
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.cost-payment-detail,
	.cost-rate {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}

	.location-flow {
		border-left: 1px solid var(--color-border-default);
		display: grid;
		gap: 1rem;
		list-style: none;
		margin: 0;
		padding: 0 0 0 1rem;
	}

	.travel-duration {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	ul {
		display: grid;
		gap: 0.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: grid;
		gap: 0.125rem;
	}

	dl {
		display: grid;
		gap: 0.375rem 1rem;
		grid-template-columns: max-content minmax(0, 1fr);
		margin: 0;
	}

	dt {
		font-weight: 700;
	}

	dd {
		margin: 0;
	}

	a {
		color: inherit;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.15em;
	}

	@media (max-width: 32rem) {
		.heading,
		.heading-actions {
			align-items: start;
			flex-direction: column;
		}

		.heading-actions {
			gap: 0.5rem;
		}
	}

	.reservation-status {
		color: var(--reservation-status);
		font-weight: 700;
	}

	.details-actions {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1rem;
	}

	.mutation-error {
		color: var(--color-state-error);
		margin: 0 0 0.75rem;
	}

	.details-action-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.mark-cost-paid-button {
		border-color: var(--color-state-success);
		color: var(--color-state-success);
	}

	.mark-cost-paid-button:hover {
		background: color-mix(in srgb, var(--color-state-success) 11%, transparent);
	}

	.delete-button {
		border-color: var(--color-state-error);
		color: var(--color-state-error);
	}

	.delete-button:hover {
		background: color-mix(in srgb, var(--color-state-error) 11%, transparent);
	}

	.delete-button:disabled,
	.mark-cost-paid-button:disabled {
		cursor: wait;
		opacity: 0.7;
	}
</style>
