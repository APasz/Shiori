<script lang="ts">
	import { onMount } from 'svelte';
	import { addCalendarDays, calendarMonthForDate } from '$lib/itinerary/calendar';
	import { formatLocalDay, getItineraryDateRange, getLocalItineraryDays } from '$lib/itinerary/presentation';
	import { formatTimestampInTimeZone } from '$lib/itinerary/time';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import type { TripView } from '$lib/server/store/views';
	import ItineraryDay from './ItineraryDay.svelte';

	let {
		tripId,
		itinerary,
		canModifyItinerary,
		canSelectItems,
		selectedItemId,
		onSelectItem,
		onCreateItem,
		onEditDayNote
	}: {
		tripId: string;
		itinerary: TripView['itinerary'];
		canModifyItinerary: boolean;
		canSelectItems: boolean;
		selectedItemId: string | null;
		onSelectItem: (itemId: string) => void;
		onCreateItem: (localDay?: string) => void;
		onEditDayNote: (date: string) => void;
	} = $props();

	let localScheduleReady = $state(false);
	let dayDisclosureReady = $state(false);
	let openDayDates = $state<string[]>([]);
	let appliedViewerRevision = $state(0);
	const localDays = $derived(localScheduleReady ? getLocalItineraryDays(itinerary.items, viewerContext.timeZone) : []);
	const dateRange = $derived(
		localScheduleReady ? getItineraryDateRange(itinerary.items, viewerContext.timeZone) : null
	);

	function storageKey(): string {
		return `shiori:open-day-cards:${tripId}`;
	}

	function defaultOpenDayDates(): string[] {
		const currentDate = formatTimestampInTimeZone(viewerContext.currentTimestamp, viewerContext.timeZone)?.date;
		const followingDate = currentDate ? addCalendarDays(currentDate, 1) : null;
		return localDays.filter((day) => day.date === currentDate || day.date === followingDate).map((day) => day.date);
	}

	function restoredOpenDayDates(): string[] | null {
		try {
			const stored = sessionStorage.getItem(storageKey());
			if (stored === null) {
				return null;
			}
			const parsed: unknown = JSON.parse(stored);
			return Array.isArray(parsed) &&
				parsed.every((date) => typeof date === 'string' && calendarMonthForDate(date) !== null)
				? [...new Set(parsed)]
				: null;
		} catch {
			return null;
		}
	}

	function saveOpenDayDates(): void {
		try {
			sessionStorage.setItem(storageKey(), JSON.stringify(openDayDates));
		} catch {
			// Day-card state is an optional browser convenience.
		}
	}

	function isDayOpen(date: string): boolean {
		return openDayDates.includes(date);
	}

	function changeDayDisclosure(date: string, event: Event): void {
		if (!dayDisclosureReady) {
			return;
		}
		const target = event.currentTarget;
		if (!(target instanceof HTMLDetailsElement)) {
			return;
		}
		openDayDates = target.open
			? [...new Set([...openDayDates, date])]
			: openDayDates.filter((openDate) => openDate !== date);
		saveOpenDayDates();
	}

	function toggleAllDayDisclosures(): void {
		const dayDates = localDays.map((day) => day.date);
		const allDaysAreOpen = dayDates.every((date) => isDayOpen(date));
		openDayDates = allDaysAreOpen ? [] : dayDates;
		saveOpenDayDates();
	}

	$effect(() => {
		const revision = viewerContext.revision;
		if (!dayDisclosureReady || revision === 0 || revision === appliedViewerRevision) {
			return;
		}
		openDayDates = defaultOpenDayDates();
		appliedViewerRevision = revision;
		saveOpenDayDates();
	});

	onMount(() => {
		appliedViewerRevision = viewerContext.revision;
		localScheduleReady = true;
		queueMicrotask(() => {
			openDayDates = restoredOpenDayDates() ?? defaultOpenDayDates();
			dayDisclosureReady = true;
		});
	});
</script>

<div class="itinerary-content">
	<div class="itinerary-summary">
		{#if !localScheduleReady || !dayDisclosureReady}
			<p class="dates">Localizing itinerary…</p>
		{:else if dateRange}
			<p class="dates">
				{formatLocalDay(dateRange[0])} – {formatLocalDay(dateRange[1])}
			</p>
		{/if}

		{#if dayDisclosureReady && localDays.length > 0}
			{@const allDaysAreOpen = localDays.every((day) => isDayOpen(day.date))}
			<button class="day-disclosure-toggle" onclick={toggleAllDayDisclosures} type="button">
				{allDaysAreOpen ? 'Collapse all' : 'Expand all'}
			</button>
		{/if}
	</div>

	<section aria-labelledby="itinerary-heading">
		{#if !localScheduleReady || !dayDisclosureReady}
			<p class="detail-prompt">Localizing your schedule…</p>
		{:else if itinerary.items.length === 0}
			<p class="empty-day">No items planned yet.</p>
			{#if canModifyItinerary}
				<div class="add-item-actions" aria-label="Add an itinerary item">
					<button onclick={() => onCreateItem()} type="button">Add item</button>
				</div>
			{/if}
		{:else}
			<div class="days">
				{#each localDays as day, index (day.date)}
					<ItineraryDay
						date={day.date}
						dayNumber={index + 1}
						items={day.items}
						tripTimeZone={itinerary.timeZone}
						isOpen={isDayOpen(day.date)}
						{canModifyItinerary}
						{canSelectItems}
						{selectedItemId}
						onDisclosureChange={changeDayDisclosure}
						{onSelectItem}
						{onCreateItem}
						{onEditDayNote}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.itinerary-content {
		margin: 0 auto;
		width: min(100% - 2rem, 48rem);
	}

	.itinerary-summary {
		align-items: center;
		display: flex;
		gap: 0.75rem;
	}

	.dates {
		margin: 0.75rem 0 0;
	}

	.itinerary-summary .dates {
		margin-bottom: 0;
	}

	.day-disclosure-toggle {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		margin-left: auto;
		padding: 0.25rem 0.5rem;
		white-space: nowrap;
	}

	.day-disclosure-toggle:hover {
		border-color: var(--color-border-strong);
	}

	.day-disclosure-toggle:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	section {
		margin-top: 1.25rem;
	}

	.days {
		display: grid;
		gap: 0.75rem;
	}

	.add-item-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
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

	.empty-day,
	.detail-prompt {
		color: var(--color-text-muted);
	}

	.empty-day {
		margin: 0;
	}

	.detail-prompt {
		margin: 1.5rem 0 0;
	}
</style>
