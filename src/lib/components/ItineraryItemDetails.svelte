<script lang="ts">
	import { onMount } from 'svelte';
	import ItineraryTime from '$lib/components/ItineraryTime.svelte';
	import ItineraryTiming from '$lib/components/ItineraryTiming.svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import type { ItineraryItem, ItineraryLocation } from '$lib/itinerary/schema';
	import { resolveTimingTimeZone, resolveTransportStopTimeZone } from '$lib/itinerary/time-zone';
	import { itemTypeAccentStyle, reservationStatusStyle } from '$lib/theme/palette';

	let {
		item,
		tripTimeZone,
		canEdit,
		deleteError,
		isDeleting,
		onDismiss,
		onDelete,
		onEdit
	}: {
		item: ItineraryItem;
		tripTimeZone: string;
		canEdit: boolean;
		deleteError: string | null;
		isDeleting: boolean;
		onDismiss: () => void;
		onDelete: () => void;
		onEdit: () => void;
	} = $props();
	let dialogElement: HTMLDialogElement;
	const timingTimeZone = $derived(resolveTimingTimeZone(item.timing, tripTimeZone));

	onMount(() => {
		dialogElement.showModal();
	});

	function startEditing(): void {
		dialogElement.close();
		onEdit();
	}

	function findLocation(locationId: string): ItineraryLocation | undefined {
		return item.locations.find((location) => location.id === locationId);
	}

	function transportStopLabel(locationId: string): string {
		return findLocation(locationId)?.name ?? locationId;
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
		<div class="heading" data-dialog-drag-handle>
			<div>
				<p class="eyebrow">{item.type}</p>
				<h2 id="item-details-heading">{item.title}</h2>
			</div>
			<div class="heading-actions">
				<ItineraryTiming includeDate timing={item.timing} timeZone={timingTimeZone} />
				{#if canEdit}
					<button class="edit-button" onclick={startEditing} type="button">Edit</button>
				{/if}
				<form method="dialog">
					<button class="close-button" type="submit">Close</button>
				</form>
			</div>
		</div>

		{#if item.locations.length > 0}
			<section aria-labelledby="locations-heading">
				<h3 id="locations-heading">Locations</h3>
				<ul>
					{#each item.locations as location (location.id)}
						<li>
							{#if location.googleMapsUrl}
								<strong>
									<a href={location.googleMapsUrl} rel="external noopener noreferrer" target="_blank">
										{location.name}
									</a>
								</strong>
							{:else}
								<strong>{location.name}</strong>
							{/if}
							{#if location.openRailwayMapUrl}
								<a
									class="location-map-link"
									href={location.openRailwayMapUrl}
									rel="external noopener noreferrer"
									target="_blank"
								>
									OpenRailwayMap
								</a>
							{/if}
							<span class="location-role">{location.role.replace('-', ' ')}</span>
							{#if location.address}<span>{location.address}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

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
				<ul class="stops">
					{#each item.transport.stops as stop (stop.locationId)}
						<li>
							<strong>{transportStopLabel(stop.locationId)}</strong>
							{#if stop.scheduledAt}
								<ItineraryTime
									startAt={stop.scheduledAt}
									timeZone={resolveTransportStopTimeZone(stop, timingTimeZone)}
								/>
							{/if}
							{#if stop.platform}<span>Platform {stop.platform}</span>{/if}
						</li>
					{/each}
				</ul>
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
				{#if deleteError}<p class="delete-error" role="alert">{deleteError}</p>{/if}
				<button class="delete-button" disabled={isDeleting} onclick={onDelete} type="button">
					{isDeleting ? 'Deleting item…' : 'Delete item'}
				</button>
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

	.location-role,
	.document-kind,
	.location-map-link {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.location-map-link {
		width: fit-content;
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
	.delete-button {
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
	.delete-button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	section {
		margin-top: 1.5rem;
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

	.stops {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1rem;
		padding-top: 1rem;
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

	.delete-error {
		color: var(--color-state-error);
		margin: 0 0 0.75rem;
	}

	.delete-button {
		border-color: var(--color-state-error);
		color: var(--color-state-error);
	}

	.delete-button:hover {
		background: color-mix(in srgb, var(--color-state-error) 11%, transparent);
	}

	.delete-button:disabled {
		cursor: wait;
		opacity: 0.7;
	}
</style>
