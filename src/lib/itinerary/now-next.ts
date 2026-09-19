import { isOpeningHoursPeriodConstraint } from './availability';
import { addCalendarDays } from './calendar';
import { hasItemTiming, type TimedItem as ItemWithTiming } from './item-placement';
import type { Constraint, ItineraryItem, ItineraryItemPlacement, ItineraryTiming } from './schema';
import { formatTimestampInTimeZone } from './time';
import { resolveTimingTimeZone } from './time-zone';
import { timingEndTimestamp, timingStartTimestamp } from './timing';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

type NowNextItem = Readonly<{
	availability?: readonly Constraint[];
	id: string;
	placement?: ItineraryItemPlacement;
	timing?: ItineraryTiming;
	type: ItineraryItem['type'];
}>;
type TimedItem<Item extends NowNextItem = NowNextItem> = ItemWithTiming<Item>;

export type AccommodationBoundary = 'check-in' | 'check-out';

type TimingNowNextEntry<Item extends NowNextItem> = Readonly<{
	boundary?: AccommodationBoundary;
	endTimestamp: number;
	isHiddenBeforeStart: boolean;
	item: TimedItem<Item>;
	possiblyActiveStartTimestamp?: number;
	source: 'timing';
	startTimestamp: number;
	timingKind: ItineraryTiming['kind'];
}>;

type AvailabilityNowNextEntry<Item extends NowNextItem> = Readonly<{
	constraint: Constraint;
	endTimestamp: number;
	isHiddenBeforeStart: false;
	item: Item;
	source: 'availability';
	startTimestamp: number;
}>;

type NowNextEntry<Item extends NowNextItem> = TimingNowNextEntry<Item> | AvailabilityNowNextEntry<Item>;

type CurrentEntryProperties<Item extends NowNextItem> = Readonly<{
	currentAvailability?: Constraint;
	currentBoundary?: AccommodationBoundary;
	currentItem: Item;
}>;

type NextEntryProperties<Item extends NowNextItem> = Readonly<{
	nextAvailability?: Constraint;
	nextBoundary?: AccommodationBoundary;
	nextItem: Item;
}>;

type OptionalNextEntryProperties<Item extends NowNextItem> = Readonly<{
	nextAvailability?: Constraint;
	nextBoundary?: AccommodationBoundary;
	nextItem?: Item;
}>;

export type NowNextState<Item extends NowNextItem> =
	| Readonly<{ kind: 'empty' }>
	| Readonly<{ kind: 'idle' }>
	| Readonly<{ kind: 'availability-complete' }>
	| (Readonly<{ kind: 'before-trip'; hoursUntilStart: number }> & NextEntryProperties<Item>)
	| (Readonly<{ kind: 'exact-current' }> & CurrentEntryProperties<Item> & OptionalNextEntryProperties<Item>)
	| (Readonly<{ kind: 'window-active' }> & CurrentEntryProperties<Item> & OptionalNextEntryProperties<Item>)
	| (Readonly<{
			approximateBoundary?: AccommodationBoundary;
			approximateItem: Item;
			kind: 'approximate-now';
	  }> &
			OptionalNextEntryProperties<Item>)
	| (Readonly<{ kind: 'next-only' }> & NextEntryProperties<Item>)
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

function accommodationEntries<Item extends NowNextItem>(
	item: TimedItem<Item>,
	tripTimeZone: string
): TimingNowNextEntry<Item>[] {
	const { timing } = item;
	if (timing.kind !== 'exact') {
		return [timingEntry(item, 'check-in')];
	}

	const timeZone = resolveTimingTimeZone(timing, tripTimeZone);
	const checkInDate = localDateForTimestamp(timing.startAt, timeZone);
	const checkInEntry: TimingNowNextEntry<Item> = {
		boundary: 'check-in',
		endTimestamp:
			timing.endAt !== undefined && localDateForTimestamp(timing.endAt, timeZone) === checkInDate
				? timing.startAt
				: followingLocalMidnight(timing.startAt, timeZone),
		isHiddenBeforeStart: false,
		item,
		source: 'timing',
		startTimestamp: timing.startAt,
		timingKind: 'exact'
	};

	if (timing.endAt === undefined) {
		return [checkInEntry];
	}

	const checkOutDate = localDateForTimestamp(timing.endAt, timeZone);
	const checkOutEntry: TimingNowNextEntry<Item> = {
		boundary: 'check-out',
		endTimestamp: timing.timePrecision === 'date' ? followingLocalMidnight(timing.endAt, timeZone) : timing.endAt,
		isHiddenBeforeStart: checkInDate !== checkOutDate,
		item,
		source: 'timing',
		startTimestamp: checkInDate === checkOutDate ? timing.endAt : localMidnight(checkOutDate, timeZone),
		timingKind: 'exact'
	};
	return [checkInEntry, checkOutEntry];
}

function timingEntry<Item extends NowNextItem>(
	item: TimedItem<Item>,
	boundary?: AccommodationBoundary
): TimingNowNextEntry<Item> {
	const { timing } = item;
	return {
		...(boundary ? { boundary } : {}),
		endTimestamp: timingEndTimestamp(timing),
		isHiddenBeforeStart: false,
		item,
		...(timing.kind === 'approximate'
			? { possiblyActiveStartTimestamp: timing.nominalAt - timing.toleranceMinutes * 60_000 }
			: {}),
		source: 'timing',
		startTimestamp: timingStartTimestamp(timing),
		timingKind: timing.kind
	};
}

function availabilityEntriesForItem<Item extends NowNextItem>(item: Item): AvailabilityNowNextEntry<Item>[] {
	const entries: AvailabilityNowNextEntry<Item>[] = [];
	for (const constraint of item.availability ?? []) {
		if (!isOpeningHoursPeriodConstraint(constraint)) {
			continue;
		}
		entries.push({
			constraint,
			endTimestamp: constraint.timing.endAt,
			isHiddenBeforeStart: false,
			item,
			source: 'availability',
			startTimestamp: constraint.timing.startAt
		});
	}
	return entries;
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

function entryBoundaryOrder<Item extends NowNextItem>(entry: NowNextEntry<Item>): number {
	return entry.source === 'timing' ? accommodationBoundaryOrder(entry.boundary) : 1;
}

function entrySourceOrder<Item extends NowNextItem>(entry: NowNextEntry<Item>): number {
	return entry.source === 'timing' ? 0 : 1;
}

function entryTieBreakId<Item extends NowNextItem>(entry: NowNextEntry<Item>): string {
	return entry.source === 'availability' ? entry.constraint.id : '';
}

function compareNowNextEntries<Item extends NowNextItem>(left: NowNextEntry<Item>, right: NowNextEntry<Item>): number {
	return (
		left.startTimestamp - right.startTimestamp ||
		entrySourceOrder(left) - entrySourceOrder(right) ||
		entryBoundaryOrder(left) - entryBoundaryOrder(right) ||
		left.item.id.localeCompare(right.item.id) ||
		entryTieBreakId(left).localeCompare(entryTieBreakId(right))
	);
}

function entryIsActive<Item extends NowNextItem>(entry: NowNextEntry<Item>, currentTimestamp: number): boolean {
	return (
		(entry.source !== 'timing' || entry.timingKind !== 'approximate') &&
		entry.startTimestamp <= currentTimestamp &&
		currentTimestamp <= entry.endTimestamp
	);
}

function entryIsPossiblyActive<Item extends NowNextItem>(entry: NowNextEntry<Item>, currentTimestamp: number): boolean {
	return (
		entry.source === 'timing' &&
		entry.possiblyActiveStartTimestamp !== undefined &&
		entry.possiblyActiveStartTimestamp <= currentTimestamp &&
		currentTimestamp <= entry.endTimestamp
	);
}

function entryIsPast<Item extends NowNextItem>(entry: NowNextEntry<Item>, currentTimestamp: number): boolean {
	return entry.endTimestamp < currentTimestamp;
}

function latestActiveEntry<Item extends NowNextItem>(
	entries: readonly NowNextEntry<Item>[],
	currentTimestamp: number,
	source: NowNextEntry<Item>['source']
): NowNextEntry<Item> | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry && entry.source === source && entryIsActive(entry, currentTimestamp)) {
			return entry;
		}
	}
	return undefined;
}

function firstPossiblyActiveEntry<Item extends NowNextItem>(
	entries: readonly NowNextEntry<Item>[],
	currentTimestamp: number
): NowNextEntry<Item> | undefined {
	return entries.find((entry) => entryIsPossiblyActive(entry, currentTimestamp));
}

function nextUpcomingEntry<Item extends NowNextItem>(
	entries: readonly NowNextEntry<Item>[],
	currentTimestamp: number,
	currentEntry?: NowNextEntry<Item>
): NowNextEntry<Item> | undefined {
	return entries.find(
		(entry) => entry !== currentEntry && !entry.isHiddenBeforeStart && entry.startTimestamp > currentTimestamp
	);
}

function currentEntryProperties<Item extends NowNextItem>(entry: NowNextEntry<Item>): CurrentEntryProperties<Item> {
	if (entry.source === 'availability') {
		return { currentAvailability: entry.constraint, currentItem: entry.item };
	}
	return {
		...(entry.boundary ? { currentBoundary: entry.boundary } : {}),
		currentItem: entry.item
	};
}

function nextEntryProperties<Item extends NowNextItem>(entry: NowNextEntry<Item>): NextEntryProperties<Item> {
	if (entry.source === 'availability') {
		return { nextAvailability: entry.constraint, nextItem: entry.item };
	}
	return {
		...(entry.boundary ? { nextBoundary: entry.boundary } : {}),
		nextItem: entry.item
	};
}

/**
 * Selects an honest Now / Next presentation state from Schedule and usable day-placement availability candidates.
 * A current Schedule wins over availability; availability never becomes itinerary timing.
 */
export function getNowNextState<Item extends NowNextItem>(
	items: Item[],
	currentTimestamp: number,
	tripTimeZone: string
): NowNextState<Item> {
	const timingEntries = items
		.filter(hasItemTiming)
		.flatMap((item) =>
			item.type === 'accommodation' ? accommodationEntries(item, tripTimeZone) : [timingEntry(item)]
		);
	const availabilityEntries = items
		.filter((item) => !hasItemTiming(item) && item.placement !== undefined)
		.flatMap(availabilityEntriesForItem);
	const entries = [...timingEntries, ...availabilityEntries].sort(compareNowNextEntries);
	if (entries.length === 0) {
		return { kind: 'empty' };
	}

	const activeEntry =
		latestActiveEntry(entries, currentTimestamp, 'timing') ??
		latestActiveEntry(entries, currentTimestamp, 'availability');
	if (activeEntry) {
		const nextEntry = nextUpcomingEntry(entries, currentTimestamp, activeEntry);
		const isExact = activeEntry.source === 'timing' ? activeEntry.timingKind === 'exact' : false;
		return {
			kind: isExact ? 'exact-current' : 'window-active',
			...currentEntryProperties(activeEntry),
			...(nextEntry ? nextEntryProperties(nextEntry) : {})
		};
	}

	const possiblyActiveEntry = firstPossiblyActiveEntry(entries, currentTimestamp);
	if (possiblyActiveEntry) {
		const nextEntry = nextUpcomingEntry(entries, currentTimestamp, possiblyActiveEntry);
		return {
			kind: 'approximate-now',
			approximateItem: possiblyActiveEntry.item,
			...(possiblyActiveEntry.source === 'timing' && possiblyActiveEntry.boundary
				? { approximateBoundary: possiblyActiveEntry.boundary }
				: {}),
			...(nextEntry ? nextEntryProperties(nextEntry) : {})
		};
	}

	const hasPastTimingEntry = timingEntries.some((entry) => entryIsPast(entry, currentTimestamp));
	const hasTimingEntries = timingEntries.length > 0;
	const nextEntry = entries.find((entry) => !entryIsPast(entry, currentTimestamp) && !entry.isHiddenBeforeStart);
	if (!hasPastTimingEntry && nextEntry?.source === 'timing') {
		return {
			kind: 'before-trip',
			hoursUntilStart: Math.ceil((nextEntry.startTimestamp - currentTimestamp) / millisecondsPerHour),
			...nextEntryProperties(nextEntry)
		};
	}
	if (nextEntry) {
		return { kind: 'next-only', ...nextEntryProperties(nextEntry) };
	}
	if (!hasTimingEntries) {
		return { kind: 'availability-complete' };
	}
	if (entries.some((entry) => entry.isHiddenBeforeStart && entry.startTimestamp > currentTimestamp)) {
		return { kind: 'idle' };
	}
	return { kind: 'complete' };
}
