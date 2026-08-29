<script lang="ts">
	import { onMount } from 'svelte';
	import {
		formatAccommodationTiming,
		formatAccommodationTimingForDay,
		formatAccommodationTimingForDayParts,
		formatAccommodationTimingParts,
		formatItineraryTiming,
		formatItineraryTimingBoundary,
		formatItineraryTimingForDay,
		timingEndTimestamp,
		timingStartTimestamp,
		type TimingBoundary,
		type TimingDisplayPart
	} from '$lib/itinerary/timing';
	import type { CalendarDateFormat } from '$lib/itinerary/calendar';
	import type { ItineraryItem, ItineraryTiming } from '$lib/itinerary/schema';
	import { timeZoneOffsetLabel, timeZoneShortLabel } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';

	let {
		timing,
		timeZone,
		day,
		includeDate = false,
		calendarDateFormat = 'date',
		itemType,
		display = 'full'
	}: {
		timing: ItineraryTiming;
		timeZone: string;
		day?: string;
		includeDate?: boolean;
		calendarDateFormat?: CalendarDateFormat;
		itemType?: ItineraryItem['type'];
		display?: 'full' | TimingBoundary;
	} = $props();
	let browserReady = $state(false);

	function formatTiming(displayTimeZone: string, dayTimeZone?: string): string | null {
		if (display !== 'full') {
			return formatItineraryTimingBoundary(
				timing,
				display,
				includeDate,
				displayTimeZone,
				calendarDateFormat,
				viewerContext.locale,
				viewerContext.formatPreferences
			);
		}
		if (day) {
			return itemType === 'accommodation'
				? formatAccommodationTimingForDay(timing, day, displayTimeZone, dayTimeZone, viewerContext.formatPreferences)
				: formatItineraryTimingForDay(timing, day, displayTimeZone, dayTimeZone, viewerContext.formatPreferences);
		}
		return itemType === 'accommodation'
			? formatAccommodationTiming(
					timing,
					includeDate,
					displayTimeZone,
					calendarDateFormat,
					viewerContext.locale,
					viewerContext.formatPreferences
				)
			: formatItineraryTiming(
					timing,
					includeDate,
					displayTimeZone,
					calendarDateFormat,
					viewerContext.locale,
					viewerContext.formatPreferences
				);
	}

	function formatTimingParts(displayTimeZone: string, dayTimeZone?: string): readonly TimingDisplayPart[] | null {
		if (display !== 'full' || itemType !== 'accommodation') {
			return null;
		}
		return day
			? formatAccommodationTimingForDayParts(timing, day, displayTimeZone, dayTimeZone, viewerContext.formatPreferences)
			: formatAccommodationTimingParts(
					timing,
					includeDate,
					displayTimeZone,
					calendarDateFormat,
					viewerContext.locale,
					viewerContext.formatPreferences
				);
	}

	const viewerParts = $derived(browserReady ? formatTimingParts(viewerContext.timeZone, viewerContext.timeZone) : null);
	const localParts = $derived(browserReady ? formatTimingParts(timeZone, viewerContext.timeZone) : null);
	const viewerLabel = $derived(
		browserReady && !viewerParts ? formatTiming(viewerContext.timeZone, viewerContext.timeZone) : null
	);
	const localLabel = $derived(browserReady && !localParts ? formatTiming(timeZone, viewerContext.timeZone) : null);
	const hasDisplayedTiming = $derived(
		!browserReady || viewerParts !== null || viewerLabel !== null || localParts !== null || localLabel !== null
	);
	const showLocalTime = $derived(timeZone !== viewerContext.timeZone);
	const displayTimestamp = $derived(display === 'end' ? timingEndTimestamp(timing) : timingStartTimestamp(timing));
	const localTimeZoneOffset = $derived(timeZoneOffsetLabel(timeZone, displayTimestamp));

	onMount(() => {
		browserReady = true;
	});
</script>

{#if hasDisplayedTiming}
	<span class:uncertain={timing.kind === 'approximate' || timing.kind === 'window'} class="itinerary-timing">
		{#if viewerParts}
			<span class="timing-parts">
				{#each viewerParts as part (`${part.label ?? ''}:${part.value}`)}
					<span class="timing-part">
						{#if part.label}<span class="timing-context">{part.label}</span>{/if}
						<span>{part.value}</span>
					</span>
				{/each}
			</span>
		{:else if viewerLabel}
			<span>{viewerLabel}</span>
		{:else if !browserReady}
			<span>Localizing…</span>
		{/if}
		{#if showLocalTime && (localParts || localLabel)}
			{#if localParts}
				<span class="local-time timing-parts" title={localTimeZoneOffset ?? undefined}>
					{#each localParts as part (`${part.label ?? ''}:${part.value}`)}
						<span class="timing-part">
							<span>{part.value}</span>
						</span>
					{/each}
					<span class="time-zone-label">{timeZoneShortLabel(timeZone, timingStartTimestamp(timing))}</span>
				</span>
			{:else}
				<span class="local-time" title={localTimeZoneOffset ?? undefined}>
					{localLabel}
					{timeZoneShortLabel(timeZone, displayTimestamp)}
				</span>
			{/if}
		{/if}
	</span>
{/if}

<style>
	.itinerary-timing {
		display: grid;
		gap: 0.125rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.timing-parts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.timing-part {
		display: grid;
		gap: 0.0625rem;
	}

	.timing-context,
	.time-zone-label {
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1.1;
	}

	.local-time {
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.local-time .time-zone-label {
		font-size: 0.625rem;
	}

	.time-zone-label {
		align-self: end;
	}

	.uncertain {
		color: var(--color-text-secondary);
	}
</style>
