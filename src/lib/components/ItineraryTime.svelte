<script lang="ts">
	import { formatTimestampInTimeZone, type FormattedLocalTimestamp } from '$lib/itinerary/time';
	import { formatCalendarDate, type CalendarDateFormat } from '$lib/itinerary/calendar';
	import { timeZoneOffsetLabel, timeZoneShortLabel } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { onMount } from 'svelte';

	let {
		startAt,
		timeZone,
		includeDate = false,
		calendarDateFormat = 'date'
	}: {
		startAt: number;
		timeZone: string;
		includeDate?: boolean;
		calendarDateFormat?: CalendarDateFormat;
	} = $props();
	let viewerTime = $state<FormattedLocalTimestamp | null>(null);
	let localTime = $state<FormattedLocalTimestamp | null>(null);
	let browserReady = $state(false);
	const machineDateTime = $derived(new Date(startAt).toISOString());
	const showLocalTime = $derived(timeZone !== viewerContext.timeZone);
	const localTimeZoneOffset = $derived(timeZoneOffsetLabel(timeZone, startAt));
	const viewerLabel = $derived(viewerTime ? timestampLabel(viewerTime) : 'Localizing…');
	const localLabel = $derived(localTime ? timestampLabel(localTime) : null);

	function timestampLabel(timestamp: FormattedLocalTimestamp): string {
		if (!includeDate) {
			return timestamp.time;
		}
		const date = formatCalendarDate(timestamp.date, calendarDateFormat);
		return date ? `${date}, ${timestamp.time}` : timestamp.time;
	}

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
	<time datetime={machineDateTime}>{viewerLabel}</time>
	{#if showLocalTime && localLabel}
		<span class="local-time" title={localTimeZoneOffset ?? undefined}>
			{localLabel}
			{timeZoneShortLabel(timeZone, startAt)}
		</span>
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
