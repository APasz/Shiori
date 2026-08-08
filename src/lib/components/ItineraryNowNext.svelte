<script lang="ts">
	import { onMount } from 'svelte';
	import type { PublicItineraryItem } from '$lib/itinerary/access';
	import { getNowNextState } from '$lib/itinerary/now-next';
	import { resolveTimingTimeZone } from '$lib/itinerary/time-zone';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { itemTypeAccentStyle } from '$lib/theme/palette';
	import ItineraryTiming from './ItineraryTiming.svelte';

	let {
		items,
		tripTimeZone
	}: {
		items: PublicItineraryItem[];
		tripTimeZone: string;
	} = $props();
	let browserReady = $state(false);
	let currentTimestamp = $state(0);
	const nowNextState = $derived(browserReady ? getNowNextState(items, currentTimestamp) : null);

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
</script>

<section aria-labelledby="now-next-heading" class="now-next">
	<h2 id="now-next-heading">Now / Next</h2>
	{#if !nowNextState}
		<p class="status">Localizing your schedule…</p>
	{:else if nowNextState.kind === 'empty'}
		<p class="status">No items planned yet.</p>
	{:else if nowNextState.kind === 'complete'}
		<p class="status">Trip complete</p>
	{:else}
		{#if nowNextState.kind === 'before-trip'}
			<p class="status">
				Trip begins in {nowNextState.daysUntilStart}
				{nowNextState.daysUntilStart === 1 ? 'day' : 'days'}
			</p>
		{:else if nowNextState.kind === 'window-active'}
			<p class="status">Active window</p>
		{/if}

		<div class="items">
			{#if nowNextState.kind === 'between-items'}
				{@render itemSummary(nowNextState.previousItem, 'Previous', true)}
				{@render itemSummary(nowNextState.nextItem, 'Next', false)}
			{:else if nowNextState.kind === 'exact-current' || nowNextState.kind === 'window-active'}
				{@render itemSummary(
					nowNextState.currentItem,
					nowNextState.kind === 'exact-current' ? 'Now' : 'Active window',
					false
				)}
				{#if nowNextState.nextItem}
					{@render itemSummary(nowNextState.nextItem, 'Next', false)}
				{/if}
			{:else}
				{@render itemSummary(nowNextState.nextItem, 'Next', false)}
			{/if}
		</div>
	{/if}
</section>

{#snippet itemSummary(item: PublicItineraryItem, label: string, subdued: boolean)}
	<article class:subdued class="item" style={itemTypeAccentStyle(item.type)}>
		<p class="item-label">{label}</p>
		<ItineraryTiming
			includeDate={true}
			timing={item.timing}
			timeZone={resolveTimingTimeZone(item.timing, tripTimeZone)}
		/>
		<span class="item-type">{item.type}</span>
		<strong>{item.title}</strong>
	</article>
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
		background: var(--color-surface-raised);
		border-left: 3px solid var(--item-accent);
		display: grid;
		gap: 0.125rem 0.75rem;
		grid-template-columns: max-content minmax(0, 1fr);
		padding: 0.625rem 0.75rem;
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
