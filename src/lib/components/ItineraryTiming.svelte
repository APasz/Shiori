<script lang="ts">
	import { onMount } from 'svelte';
	import { formatItineraryTiming, formatItineraryTimingForDay } from '$lib/itinerary/timing';
	import type { ItineraryTiming } from '$lib/itinerary/schema';
	import { timeZoneShortLabel } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';

	let {
		timing,
		timeZone,
		day,
		includeDate = false
	}: {
		timing: ItineraryTiming;
		timeZone: string;
		day?: string;
		includeDate?: boolean;
	} = $props();
	let browserReady = $state(false);
	const viewerLabel = $derived(
		browserReady
			? day
				? formatItineraryTimingForDay(timing, day, viewerContext.timeZone, viewerContext.timeZone)
				: formatItineraryTiming(timing, includeDate, viewerContext.timeZone)
			: null
	);
	const localLabel = $derived(
		browserReady
			? day
				? formatItineraryTimingForDay(timing, day, timeZone, viewerContext.timeZone)
				: formatItineraryTiming(timing, includeDate, timeZone)
			: null
	);
	const showLocalTime = $derived(timeZone !== viewerContext.timeZone);

	onMount(() => {
		browserReady = true;
	});
</script>

<span class:uncertain={timing.kind === 'approximate' || timing.kind === 'window'} class="itinerary-timing">
	<span>{viewerLabel ?? 'Localizing…'}</span>
	{#if showLocalTime && localLabel}
		<span class="local-time">{localLabel} {timeZoneShortLabel(timeZone)}</span>
	{/if}
</span>

<style>
	.itinerary-timing {
		display: grid;
		gap: 0.125rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.local-time {
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.uncertain {
		color: var(--color-text-secondary);
	}
</style>
