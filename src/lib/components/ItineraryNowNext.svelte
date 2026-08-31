<script lang="ts">
	import { onMount } from 'svelte';
	import type { PublicItineraryItem } from '$lib/itinerary/access';
	import { getNowNextState, type AccommodationBoundary } from '$lib/itinerary/now-next';
	import { resolveTimingTimeZone } from '$lib/itinerary/time-zone';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { itemTypeAccentStyle } from '$lib/theme/palette';
	import ItineraryTiming from './ItineraryTiming.svelte';

	let {
		items,
		tripTimeZone,
		canSelectItems,
		onSelectItem
	}: {
		items: PublicItineraryItem[];
		tripTimeZone: string;
		canSelectItems: boolean;
		onSelectItem: (itemId: string) => void;
	} = $props();
	let browserReady = $state(false);
	let currentTimestamp = $state(0);
	const nowNextState = $derived(browserReady ? getNowNextState(items, currentTimestamp, tripTimeZone) : null);

	$effect(() => {
		void viewerContext.revision;
		if (browserReady) {
			currentTimestamp = viewerContext.currentTimestamp;
		}
	});

	onMount(() => {
		browserReady = true;
		currentTimestamp = viewerContext.currentTimestamp;
		const intervalId = window.setInterval(() => {
			if (!viewerContext.isSimulated) {
				currentTimestamp = viewerContext.currentTimestamp;
			}
		}, 60_000);

		return () => window.clearInterval(intervalId);
	});

	function formatHoursUntilStart(hoursUntilStart: number): string {
		if (hoursUntilStart < 24) {
			return `${hoursUntilStart}h`;
		}

		const days = Math.floor(hoursUntilStart / 24);
		const remainingHours = hoursUntilStart % 24;
		return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
	}

	function itemLabel(label: string, boundary: AccommodationBoundary | undefined): string {
		if (!boundary) {
			return label;
		}
		return `${label} · ${accommodationBoundaryLabel(boundary)}`;
	}

	function accommodationBoundaryLabel(boundary: AccommodationBoundary): 'Check-in' | 'Check-out' {
		return boundary === 'check-in' ? 'Check-in' : 'Check-out';
	}

	function timingDisplay(boundary: AccommodationBoundary | undefined): 'end' | 'full' | 'start' {
		switch (boundary) {
			case 'check-in':
				return 'start';
			case 'check-out':
				return 'end';
			case undefined:
				return 'full';
		}
	}
</script>

<section aria-labelledby="now-next-heading" class="now-next">
	<h2 id="now-next-heading">Now / Next</h2>
	{#if !nowNextState}
		<p class="status">Localizing your schedule…</p>
	{:else if nowNextState.kind === 'empty'}
		<p class="status">No items planned yet</p>
	{:else if nowNextState.kind === 'idle'}
		<p class="status">Nothing scheduled right now</p>
	{:else if nowNextState.kind === 'complete'}
		<p class="status">Trip complete</p>
	{:else}
		{#if nowNextState.kind === 'before-trip'}
			<p class="status">Starts in {formatHoursUntilStart(nowNextState.hoursUntilStart)}</p>
		{:else if nowNextState.kind === 'window-active'}
			<p class="status">
				{nowNextState.currentBoundary
					? `${accommodationBoundaryLabel(nowNextState.currentBoundary)} window now`
					: 'Open now'}
			</p>
		{/if}

		<div class="items">
			{#if nowNextState.kind === 'exact-current' || nowNextState.kind === 'window-active'}
				{@render itemSummary(nowNextState.currentItem, 'Now', false, nowNextState.currentBoundary)}
				{#if nowNextState.nextItem}
					{@render itemSummary(nowNextState.nextItem, 'Next', false, nowNextState.nextBoundary)}
				{/if}
			{:else if nowNextState.kind === 'approximate-now'}
				{@render itemSummary(nowNextState.approximateItem, 'Around now', false, nowNextState.approximateBoundary)}
				{#if nowNextState.nextItem}
					{@render itemSummary(nowNextState.nextItem, 'Next', false, nowNextState.nextBoundary)}
				{/if}
			{:else}
				{@render itemSummary(nowNextState.nextItem, 'Next', false, nowNextState.nextBoundary)}
			{/if}
		</div>
	{/if}
</section>

{#snippet itemSummary(
	item: PublicItineraryItem,
	label: string,
	subdued: boolean,
	boundary: AccommodationBoundary | undefined
)}
	{#if canSelectItems}
		<button
			class:subdued
			class="item item-button"
			onclick={() => onSelectItem(item.id)}
			style={itemTypeAccentStyle(item.type)}
			type="button"
			aria-haspopup="dialog"
		>
			{@render itemSummaryContent(item, label, boundary)}
		</button>
	{:else}
		<article class:subdued class="item" style={itemTypeAccentStyle(item.type)}>
			{@render itemSummaryContent(item, label, boundary)}
		</article>
	{/if}
{/snippet}

{#snippet itemSummaryContent(item: PublicItineraryItem, label: string, boundary: AccommodationBoundary | undefined)}
	<p class="item-label">{itemLabel(label, boundary)}</p>
	<ItineraryTiming
		display={timingDisplay(boundary)}
		includeDate={true}
		itemType={item.type}
		timing={item.timing}
		timeZone={resolveTimingTimeZone(item.timing, tripTimeZone)}
	/>
	<span class="item-type">{item.type}</span>
	<strong>{item.title}</strong>
{/snippet}

<style>
	.now-next {
		margin: 1.25rem auto 0;
		width: min(100%, 48rem);
	}

	h2,
	p {
		margin-top: 0;
	}

	h2 {
		font-size: 0.8125rem;
		letter-spacing: 0.08em;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
	}

	.status {
		color: var(--color-text-secondary);
		margin-bottom: 0.625rem;
	}

	.items {
		display: grid;
		gap: 0.5rem;
	}

	.item {
		appearance: none;
		background: var(--color-surface-raised);
		border: 0;
		border-left: 3px solid var(--item-accent);
		color: inherit;
		display: grid;
		gap: 0.125rem 0.75rem;
		grid-template-columns: max-content minmax(0, 1fr);
		padding: 0.625rem 0.75rem;
		text-align: left;
	}

	.item-button {
		cursor: pointer;
		font: inherit;
		width: 100%;
	}

	.item-button:hover {
		background: var(--color-surface-subtle);
	}

	.item-button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.item :global(.itinerary-timing) {
		grid-column: 2;
		grid-row: 1 / span 2;
	}

	.item-label,
	.item-type {
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		margin: 0;
		text-transform: uppercase;
	}

	.item-label {
		color: var(--color-text-secondary);
	}

	.item-type {
		color: var(--item-accent);
	}

	strong {
		grid-column: 1 / -1;
	}

	.subdued {
		opacity: 0.58;
	}
</style>
