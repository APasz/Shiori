<script lang="ts">
	import { formatTimestampInTimeZone, type FormattedLocalTimestamp } from '$lib/itinerary/time';
	import { timeZoneShortLabel } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { onMount } from 'svelte';

	let { startAt, timeZone }: { startAt: number; timeZone: string } = $props();
	let viewerTime = $state<FormattedLocalTimestamp | null>(null);
	let localTime = $state<FormattedLocalTimestamp | null>(null);
	let browserReady = $state(false);
	const machineDateTime = $derived(new Date(startAt).toISOString());
	const showLocalTime = $derived(timeZone !== viewerContext.timeZone);

	onMount(() => {
		browserReady = true;
	});

	$effect(() => {
		if (browserReady) {
			viewerTime = formatTimestampInTimeZone(startAt, viewerContext.timeZone);
			localTime = formatTimestampInTimeZone(startAt, timeZone);
		}
	});
</script>

<span class="itinerary-time">
	<time datetime={machineDateTime}>{viewerTime?.time ?? 'Localizing…'}</time>
	{#if showLocalTime && localTime}
		<span class="local-time">{localTime.time} {timeZoneShortLabel(timeZone)}</span>
	{/if}
</span>

<style>
	.itinerary-time {
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}

	time {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		white-space: nowrap;
	}

	.local-time {
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		font-weight: 500;
	}
</style>
