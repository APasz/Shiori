<script lang="ts">
	import ItineraryItemIllustration from '$lib/components/ItineraryItemIllustration.svelte';
	import ItineraryTime from '$lib/components/ItineraryTime.svelte';
	import ItineraryTiming from '$lib/components/ItineraryTiming.svelte';
	import { formatLocalDay, partitionDayItems, type DayTimelineEntry } from '$lib/itinerary/presentation';
	import { resolveTimingTimeZone } from '$lib/itinerary/time-zone';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { itemTypeAccentStyle } from '$lib/theme/palette';
	import type { DayItem } from './types';

	let {
		date,
		dayNumber,
		items,
		tripTimeZone,
		isOpen,
		canModifyItinerary,
		canSelectItems,
		selectedItemId,
		onDisclosureChange,
		onSelectItem,
		onCreateItem,
		onEditDayNote
	}: {
		date: string;
		dayNumber: number;
		items: DayItem[];
		tripTimeZone: string;
		isOpen: boolean;
		canModifyItinerary: boolean;
		canSelectItems: boolean;
		selectedItemId: string | null;
		onDisclosureChange: (date: string, event: Event) => void;
		onSelectItem: (itemId: string) => void;
		onCreateItem: (date: string) => void;
		onEditDayNote: (date: string) => void;
	} = $props();

	type Display = 'stay' | 'timeline';

	const itemTypeLabels: Record<DayItem['type'], string> = {
		transport: 'Transport',
		activity: 'Activity',
		accommodation: 'Accommodation'
	};
	const dayItems = $derived(partitionDayItems(items, date, viewerContext.timeZone));

	function selectItem(itemId: string): void {
		if (canSelectItems) {
			onSelectItem(itemId);
		}
	}
</script>

{#snippet dayItem(item: DayItem, display: Display)}
	<li class={display === 'stay' ? 'stay-row' : 'item-row'}>
		{#if canSelectItems}
			<button
				type="button"
				class={display === 'stay' ? 'stay-button' : 'item-button'}
				class:selected={selectedItemId === item.id}
				aria-haspopup="dialog"
				aria-pressed={selectedItemId === item.id}
				onclick={() => selectItem(item.id)}
				style={itemTypeAccentStyle(item.type)}
			>
				<ItineraryTiming
					day={date}
					itemType={item.type}
					timing={item.timing}
					timeZone={resolveTimingTimeZone(item.timing, tripTimeZone)}
				/>
				{#if display === 'timeline'}
					<span class="item-type">{itemTypeLabels[item.type]}</span>
				{/if}
				<span class:item-title={display === 'timeline'} class:stay-title={display === 'stay'}>
					<span data-item-title-text>{item.title}</span>
				</span>
				{#if display === 'timeline'}
					<ItineraryItemIllustration {item} />
				{/if}
			</button>
		{:else}
			<div class={display === 'stay' ? 'stay-summary' : 'item-summary'} style={itemTypeAccentStyle(item.type)}>
				<ItineraryTiming
					day={date}
					itemType={item.type}
					timing={item.timing}
					timeZone={resolveTimingTimeZone(item.timing, tripTimeZone)}
				/>
				{#if display === 'timeline'}
					<span class="item-type">{itemTypeLabels[item.type]}</span>
				{/if}
				<span class:item-title={display === 'timeline'} class:stay-title={display === 'stay'}>
					<span data-item-title-text>{item.title}</span>
				</span>
				{#if display === 'timeline'}
					<ItineraryItemIllustration {item} />
				{/if}
			</div>
		{/if}
	</li>
{/snippet}

{#snippet stayBoundaryItem(entry: Extract<DayTimelineEntry<DayItem>, { kind: 'stay-boundary' }>)}
	{@const boundaryLabel = entry.boundary === 'check-in' ? 'Check in' : 'Check out'}
	<li class="stay-boundary-row">
		{#if canSelectItems}
			<button
				aria-haspopup="dialog"
				aria-label={`${boundaryLabel}: ${entry.item.title}`}
				aria-pressed={selectedItemId === entry.item.id}
				class:selected={selectedItemId === entry.item.id}
				class="stay-boundary-button"
				onclick={() => selectItem(entry.item.id)}
				style={itemTypeAccentStyle(entry.item.type)}
				type="button"
			>
				<ItineraryTime startAt={entry.timestamp} timeZone={resolveTimingTimeZone(entry.item.timing, tripTimeZone)} />
				<span class="stay-boundary-label">{boundaryLabel}</span>
			</button>
		{:else}
			<div class="stay-boundary-summary" style={itemTypeAccentStyle(entry.item.type)}>
				<ItineraryTime startAt={entry.timestamp} timeZone={resolveTimingTimeZone(entry.item.timing, tripTimeZone)} />
				<span class="stay-boundary-label">{boundaryLabel}</span>
			</div>
		{/if}
	</li>
{/snippet}

{#snippet stayBlock(stays: DayItem[], position: 'arriving' | 'ongoing')}
	<section
		aria-label={`${position === 'ongoing' ? 'Continuing stays' : 'Check-ins'} on ${formatLocalDay(date)}`}
		class="stay-block"
	>
		<h4>{position === 'ongoing' ? 'Continuing stays' : 'Check-ins'}</h4>
		<ul class="stay-list">
			{#each stays as item (item.id)}
				{@render dayItem(item, 'stay')}
			{/each}
		</ul>
	</section>
{/snippet}

<details class="day" open={isOpen} ontoggle={(event) => onDisclosureChange(date, event)}>
	<summary><h3>Day {dayNumber}: {formatLocalDay(date)}</h3></summary>
	<div class="day-content">
		{#if dayItems.ongoingStays.length > 0}
			{@render stayBlock(dayItems.ongoingStays, 'ongoing')}
		{/if}
		{#if dayItems.timelineEntries.length === 0 && dayItems.ongoingStays.length === 0 && dayItems.arrivingStays.length === 0}
			<p class="empty-day">No items planned for this day.</p>
		{:else if dayItems.timelineEntries.length > 0}
			<ul>
				{#each dayItems.timelineEntries as entry (`${entry.item.id}:${entry.kind}:${entry.timestamp}`)}
					{#if entry.kind === 'item'}
						{@render dayItem(entry.item, 'timeline')}
					{:else}
						{@render stayBoundaryItem(entry)}
					{/if}
				{/each}
			</ul>
		{/if}
		{#if dayItems.arrivingStays.length > 0}
			{@render stayBlock(dayItems.arrivingStays, 'arriving')}
		{/if}
		{#if canModifyItinerary}
			<div class="add-item-actions" aria-label={`Add an item on ${formatLocalDay(date)}`}>
				<button onclick={() => onCreateItem(date)} type="button">Add item</button>
				<button onclick={() => onEditDayNote(date)} type="button">Notes</button>
			</div>
		{/if}
	</div>
</details>

<style>
	h3 {
		font-size: 1rem;
		line-height: 1.3;
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		padding: 0.25rem 0;
	}

	li + li {
		border-top: 1px solid var(--color-border-subtle);
	}

	.day {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-default);
		container-type: inline-size;
		min-width: 0;
	}

	.day summary {
		align-items: flex-start;
		cursor: pointer;
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
		list-style: none;
		padding: 0.5rem 0.75rem;
	}

	.day summary::-webkit-details-marker {
		display: none;
	}

	.day summary::after {
		color: var(--color-text-muted);
		content: '+';
		font-size: 1.25rem;
		font-weight: 400;
		flex: 0 0 auto;
		line-height: 1;
		margin-top: 0.0625rem;
	}

	.day[open] summary {
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.day[open] summary::after {
		content: '−';
	}

	.day summary:hover {
		background: var(--color-surface-subtle);
	}

	.day summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.day-content {
		padding: 0.625rem 0.75rem 0.75rem;
	}

	.stay-block {
		border: 1px solid var(--color-border-default);
		border-left: 3px solid var(--color-item-type-accommodation);
		margin: 0 0 0.625rem;
	}

	.stay-block h4 {
		color: var(--color-item-type-accommodation);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		margin: 0;
		padding: 0.25rem 0.5rem 0;
		text-transform: uppercase;
	}

	.stay-row,
	.stay-boundary-row {
		padding: 0;
	}

	.stay-button,
	.stay-summary {
		align-items: start;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.5rem;
		grid-template-columns: minmax(0, 1fr) max-content;
		padding: 0.125rem 0.5rem 0.375rem;
		text-align: left;
		width: 100%;
	}

	.stay-button:hover,
	.stay-boundary-button:hover,
	.item-button:hover {
		border-color: var(--item-accent);
	}

	.stay-button.selected,
	.stay-boundary-button.selected,
	.item-button.selected {
		box-shadow: inset 3px 0 var(--color-state-selection);
	}

	.stay-button :global(.itinerary-timing),
	.stay-summary :global(.itinerary-timing) {
		grid-column: 2;
		grid-row: 1;
	}

	:global(.itinerary-timing),
	:global(.itinerary-time) {
		min-width: 0;
	}

	:global(.itinerary-timing .local-time) {
		white-space: normal;
	}

	.stay-title {
		align-self: center;
		color: var(--color-text-primary);
		font-weight: 600;
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.stay-boundary-button,
	.stay-boundary-summary {
		align-items: start;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.75rem;
		grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr);
		padding: 0.375rem 0.5rem;
		text-align: left;
		width: 100%;
	}

	.stay-boundary-button:focus-visible,
	.item-button:focus-visible,
	.stay-button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.stay-boundary-label,
	.item-type {
		color: var(--item-accent);
	}

	.stay-boundary-label {
		font-size: 0.8125rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.item-button,
	.item-summary {
		align-items: start;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.25rem 0.75rem;
		grid-template-columns: minmax(7rem, 9rem) 7rem minmax(0, 1fr);
		min-block-size: 3.25rem;
		padding: 0.375rem 0.5rem;
		position: relative;
		text-align: left;
		width: 100%;
	}

	.item-type {
		font-size: 0.6875rem;
		line-height: 1.8;
		position: relative;
		z-index: 1;
	}

	.item-title {
		min-width: 0;
		overflow-wrap: anywhere;
		position: relative;
		z-index: 1;
	}

	:global(.item-illustration-overlaps) {
		text-shadow:
			0 1px 2px var(--color-surface-raised),
			1px 0 2px var(--color-surface-raised),
			-1px 0 2px var(--color-surface-raised);
	}

	.item-row {
		min-width: 0;
	}

	.add-item-actions {
		align-items: center;
		border-top: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.75rem;
		gap: 0.375rem;
		margin-top: 0.625rem;
		padding-top: 0.625rem;
	}

	.add-item-actions button {
		appearance: none;
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
	}

	.add-item-actions button:hover {
		border-color: var(--color-state-selection);
	}

	.add-item-actions button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.empty-day {
		color: var(--color-text-muted);
		margin: 0;
	}

	@container (max-width: 33.999rem) {
		.item-button,
		.item-summary {
			align-items: start;
			grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr);
		}

		.item-type,
		.item-title {
			grid-column: 2;
		}
	}

	@container (max-width: 23.999rem) {
		.day summary,
		.day-content {
			padding-left: 0.625rem;
			padding-right: 0.625rem;
		}

		.stay-boundary-button,
		.stay-boundary-summary,
		.item-button,
		.item-summary {
			gap: 0.25rem 0.5rem;
			padding-left: 0.375rem;
			padding-right: 0.375rem;
		}
	}

	@container (max-width: 40rem) {
		.day summary {
			min-block-size: 2.75rem;
		}

		.add-item-actions button {
			min-height: 2.75rem;
		}
	}
</style>
