import { addCalendarDays } from './calendar';
import type { ItineraryItem, ItineraryTiming } from './schema';
import { formatTimestampInTimeZone } from './time';
import { resolveTimingTimeZone } from './time-zone';
import { timingEndTimestamp, timingStartTimestamp } from './timing';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

type TimedItem = Readonly<{
	id: string;
	timing: ItineraryTiming;
	type: ItineraryItem['type'];
}>;

export type AccommodationBoundary = 'check-in' | 'check-out';

type NowNextEntry<Item extends TimedItem> = Readonly<{
	boundary?: AccommodationBoundary;
	endTimestamp: number;
	isHiddenBeforeStart: boolean;
	item: Item;
	possiblyActiveStartTimestamp?: number;
	startTimestamp: number;
	timingKind: ItineraryTiming['kind'];
}>;

export type NowNextState<Item extends TimedItem> =
	| Readonly<{ kind: 'empty' }>
	| Readonly<{ kind: 'idle' }>
	| Readonly<{ kind: 'before-trip'; hoursUntilStart: number; nextBoundary?: AccommodationBoundary; nextItem: Item }>
	| Readonly<{
			currentBoundary?: AccommodationBoundary;
			currentItem: Item;
			kind: 'exact-current';
			nextBoundary?: AccommodationBoundary;
			nextItem?: Item;
	  }>
	| Readonly<{
			currentBoundary?: AccommodationBoundary;
			currentItem: Item;
			kind: 'window-active';
			nextBoundary?: AccommodationBoundary;
			nextItem?: Item;
	  }>
	| Readonly<{
			approximateBoundary?: AccommodationBoundary;
			approximateItem: Item;
			kind: 'approximate-now';
			nextBoundary?: AccommodationBoundary;
			nextItem?: Item;
	  }>
	| Readonly<{ kind: 'next-only'; nextBoundary?: AccommodationBoundary; nextItem: Item }>
	| Readonly<{ kind: 'complete' }>;

const millisecondsPerHour = 3_600_000;

function localDateForTimestamp(timestamp: number, timeZone: string): string {
	const formatted = formatTimestampInTimeZone(timestamp, timeZone);
	if (!formatted) {
		throw new Error(`Cannot determine the local date for ${timestamp} in ${timeZone}.`);
	}
	return formatted.date;
}

function localMidnight(date: string, timeZone: string): number {
	const timestamp = zonedDateTimeToUnixMilliseconds(`${date}T00:00`, timeZone);
	if (timestamp === null) {
		throw new Error(`Cannot determine midnight for ${date} in ${timeZone}.`);
	}
	return timestamp;
}

function followingLocalMidnight(timestamp: number, timeZone: string): number {
	const date = localDateForTimestamp(timestamp, timeZone);
	const followingDate = addCalendarDays(date, 1);
	if (!followingDate) {
		throw new Error(`Cannot determine the day after ${date}.`);
	}
	return localMidnight(followingDate, timeZone);
}

function accommodationEntries<Item extends TimedItem>(item: Item, tripTimeZone: string): NowNextEntry<Item>[] {
	const { timing } = item;
	if (timing.kind !== 'exact') {
		return [timingEntry(item, 'check-in')];
	}

	const timeZone = resolveTimingTimeZone(timing, tripTimeZone);
	const checkInDate = localDateForTimestamp(timing.startAt, timeZone);
	const checkInEntry: NowNextEntry<Item> = {
		boundary: 'check-in',
		endTimestamp:
			timing.endAt !== undefined && localDateForTimestamp(timing.endAt, timeZone) === checkInDate
				? timing.startAt
				: followingLocalMidnight(timing.startAt, timeZone),
		isHiddenBeforeStart: false,
		item,
		startTimestamp: timing.startAt,
		timingKind: 'exact'
	};

	if (timing.endAt === undefined) {
		return [checkInEntry];
	}

	const checkOutDate = localDateForTimestamp(timing.endAt, timeZone);
	const checkOutEntry: NowNextEntry<Item> = {
		boundary: 'check-out',
		endTimestamp: timing.timePrecision === 'date' ? followingLocalMidnight(timing.endAt, timeZone) : timing.endAt,
		isHiddenBeforeStart: checkInDate !== checkOutDate,
		item,
		startTimestamp: checkInDate === checkOutDate ? timing.endAt : localMidnight(checkOutDate, timeZone),
		timingKind: 'exact'
	};
	return [checkInEntry, checkOutEntry];
}

function timingEntry<Item extends TimedItem>(item: Item, boundary?: AccommodationBoundary): NowNextEntry<Item> {
	const { timing } = item;
	return {
		...(boundary ? { boundary } : {}),
		endTimestamp: timingEndTimestamp(timing),
		isHiddenBeforeStart: false,
		item,
		...(timing.kind === 'approximate'
			? { possiblyActiveStartTimestamp: timing.nominalAt - timing.toleranceMinutes * 60_000 }
			: {}),
		startTimestamp: timingStartTimestamp(timing),
		timingKind: timing.kind
	};
}

function entriesForItem<Item extends TimedItem>(item: Item, tripTimeZone: string): NowNextEntry<Item>[] {
	return item.type === 'accommodation' ? accommodationEntries(item, tripTimeZone) : [timingEntry(item)];
}

function accommodationBoundaryOrder(boundary: AccommodationBoundary | undefined): number {
	switch (boundary) {
		case 'check-out':
			return 0;
		case undefined:
			return 1;
		case 'check-in':
			return 2;
	}
}

function compareNowNextEntries<Item extends TimedItem>(left: NowNextEntry<Item>, right: NowNextEntry<Item>): number {
	return (
		left.startTimestamp - right.startTimestamp ||
		accommodationBoundaryOrder(left.boundary) - accommodationBoundaryOrder(right.boundary) ||
		left.item.id.localeCompare(right.item.id)
	);
}

function entryIsActive<Item extends TimedItem>(entry: NowNextEntry<Item>, currentTimestamp: number): boolean {
	return (
		entry.timingKind !== 'approximate' &&
		entry.startTimestamp <= currentTimestamp &&
		currentTimestamp <= entry.endTimestamp
	);
}

function entryIsPossiblyActive<Item extends TimedItem>(entry: NowNextEntry<Item>, currentTimestamp: number): boolean {
	return (
		entry.possiblyActiveStartTimestamp !== undefined &&
		entry.possiblyActiveStartTimestamp <= currentTimestamp &&
		currentTimestamp <= entry.endTimestamp
	);
}

function entryIsPast<Item extends TimedItem>(entry: NowNextEntry<Item>, currentTimestamp: number): boolean {
	return entry.endTimestamp < currentTimestamp;
}

function latestActiveEntry<Item extends TimedItem>(
	entries: NowNextEntry<Item>[],
	currentTimestamp: number
): NowNextEntry<Item> | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry && entryIsActive(entry, currentTimestamp)) {
			return entry;
		}
	}
	return undefined;
}

function firstPossiblyActiveEntry<Item extends TimedItem>(
	entries: NowNextEntry<Item>[],
	currentTimestamp: number
): NowNextEntry<Item> | undefined {
	return entries.find((entry) => entryIsPossiblyActive(entry, currentTimestamp));
}

function nextUpcomingEntry<Item extends TimedItem>(
	entries: NowNextEntry<Item>[],
	currentTimestamp: number,
	currentEntry?: NowNextEntry<Item>
): NowNextEntry<Item> | undefined {
	return entries.find(
		(entry) => entry !== currentEntry && !entry.isHiddenBeforeStart && entry.startTimestamp > currentTimestamp
	);
}

/**
 * Selects an honest Now / Next presentation state for an ordered trip timeline.
 * Approximate timings are never treated as definitely current.
 */
export function getNowNextState<Item extends TimedItem>(
	items: Item[],
	currentTimestamp: number,
	tripTimeZone: string
): NowNextState<Item> {
	const entries = items.flatMap((item) => entriesForItem(item, tripTimeZone)).sort(compareNowNextEntries);
	if (entries.length === 0) {
		return { kind: 'empty' };
	}

	const activeEntry = latestActiveEntry(entries, currentTimestamp);
	if (activeEntry) {
		const nextEntry = nextUpcomingEntry(entries, currentTimestamp, activeEntry);
		return activeEntry.timingKind === 'exact'
			? {
					kind: 'exact-current',
					currentItem: activeEntry.item,
					...(activeEntry.boundary ? { currentBoundary: activeEntry.boundary } : {}),
					...(nextEntry
						? {
								nextItem: nextEntry.item,
								...(nextEntry.boundary ? { nextBoundary: nextEntry.boundary } : {})
							}
						: {})
				}
			: {
					kind: 'window-active',
					currentItem: activeEntry.item,
					...(activeEntry.boundary ? { currentBoundary: activeEntry.boundary } : {}),
					...(nextEntry
						? {
								nextItem: nextEntry.item,
								...(nextEntry.boundary ? { nextBoundary: nextEntry.boundary } : {})
							}
						: {})
				};
	}

	const possiblyActiveEntry = firstPossiblyActiveEntry(entries, currentTimestamp);
	if (possiblyActiveEntry) {
		const nextEntry = nextUpcomingEntry(entries, currentTimestamp, possiblyActiveEntry);
		return {
			kind: 'approximate-now',
			approximateItem: possiblyActiveEntry.item,
			...(possiblyActiveEntry.boundary ? { approximateBoundary: possiblyActiveEntry.boundary } : {}),
			...(nextEntry
				? {
						nextItem: nextEntry.item,
						...(nextEntry.boundary ? { nextBoundary: nextEntry.boundary } : {})
					}
				: {})
		};
	}

	const hasPastEntry = entries.some((entry) => entryIsPast(entry, currentTimestamp));
	const nextEntry = entries.find((entry) => !entryIsPast(entry, currentTimestamp) && !entry.isHiddenBeforeStart);
	if (!hasPastEntry && nextEntry) {
		return {
			kind: 'before-trip',
			hoursUntilStart: Math.ceil((nextEntry.startTimestamp - currentTimestamp) / millisecondsPerHour),
			nextItem: nextEntry.item,
			...(nextEntry.boundary ? { nextBoundary: nextEntry.boundary } : {})
		};
	}
	if (nextEntry) {
		return {
			kind: 'next-only',
			nextItem: nextEntry.item,
			...(nextEntry.boundary ? { nextBoundary: nextEntry.boundary } : {})
		};
	}
	if (entries.some((entry) => entry.isHiddenBeforeStart && entry.startTimestamp > currentTimestamp)) {
		return { kind: 'idle' };
	}
	return { kind: 'complete' };
}
