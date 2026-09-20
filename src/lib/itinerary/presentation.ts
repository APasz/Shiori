import {
	addCalendarDays,
	calendarDayCount,
	formatCalendarDate,
	type CalendarDateFormat,
	type CalendarLocale
} from './calendar';
import { defaultFormatPreferences, type DateFormat } from '$lib/format-preferences';
import {
	resolveItemCalendarDayMembership,
	resolveItemDayChronologicalPosition,
	resolveItemPlanTemporalSource,
	resolvePlanStartDate,
	type ItemWithDayOrderingTemporalSources
} from './item-temporal';
import type { ItineraryItem, ItineraryTiming } from './schema';
import { timingEndTimestamp, timingStartTimestamp } from './timing';
import { formatTimestampForTimeZoneInput, zonedDateTimeToUnixMilliseconds } from './zoned-time';

export { timingStartTimestamp as timingAnchor } from './timing';

type PlacedItem = ItemWithDayOrderingTemporalSources & Readonly<{ id: string }>;
type ItemWithType = Readonly<{
	type: ItineraryItem['type'];
}>;
type PlacedItemWithType = PlacedItem & ItemWithType;

export type LocalItineraryDay<Item extends PlacedItem> = Readonly<{
	date: string;
	items: Item[];
}>;

export type DayTimelineEntry<Item extends PlacedItemWithType> =
	| Readonly<{
			item: Item;
			kind: 'item';
			/** Undefined means no policy-approved chronological source for this day's item. */
			timestamp?: number;
	  }>
	| Readonly<{
			boundary: 'check-in' | 'check-out';
			item: Item;
			kind: 'stay-boundary';
			timestamp: number;
	  }>;

export type DayItemPartition<Item extends PlacedItemWithType> = Readonly<{
	arrivingStays: Item[];
	ongoingStays: Item[];
	timelineEntries: DayTimelineEntry<Item>[];
}>;

type DayBounds = Readonly<{
	dayEnd: number;
	dayStart: number;
}>;

function dayBounds(date: string, timeZone: string): DayBounds {
	const dayStart = zonedDateTimeToUnixMilliseconds(`${date}T00:00`, timeZone);
	const followingDate = addCalendarDays(date, 1);
	const dayEnd = followingDate ? zonedDateTimeToUnixMilliseconds(`${followingDate}T00:00`, timeZone) : null;
	if (dayStart === null || dayEnd === null) {
		throw new Error(`Cannot determine day bounds for ${date} in ${timeZone}.`);
	}
	return { dayEnd, dayStart };
}

function timelineEntryOrder<Item extends PlacedItemWithType>(
	left: DayTimelineEntry<Item>,
	right: DayTimelineEntry<Item>
): number {
	if (left.timestamp === undefined || right.timestamp === undefined) {
		if (left.timestamp !== right.timestamp) {
			return left.timestamp === undefined ? 1 : -1;
		}
		return left.item.id.localeCompare(right.item.id);
	}
	if (left.timestamp !== right.timestamp) {
		return left.timestamp - right.timestamp;
	}
	if (left.kind !== right.kind) {
		return left.kind === 'stay-boundary' ? -1 : 1;
	}
	if (left.kind === 'stay-boundary' && right.kind === 'stay-boundary' && left.boundary !== right.boundary) {
		return left.boundary === 'check-out' ? -1 : 1;
	}
	return left.item.id.localeCompare(right.item.id);
}

function isTimestampOnDay(timestamp: number, bounds: DayBounds): boolean {
	return timestamp >= bounds.dayStart && timestamp < bounds.dayEnd;
}

function isOngoingAccommodation(timing: ItineraryTiming, bounds: DayBounds): boolean {
	if (timingStartTimestamp(timing) >= bounds.dayStart) {
		return false;
	}
	if (timing.kind === 'exact' && timing.endAt === undefined) {
		return true;
	}
	return timingEndTimestamp(timing) >= bounds.dayStart;
}

/** Places continuing stays above a day and new check-ins below it, with known stay boundaries in chronological order. */
export function partitionDayItems<Item extends PlacedItemWithType>(
	items: readonly Item[],
	date: string,
	timeZone: string
): DayItemPartition<Item> {
	const arrivingStays: Item[] = [];
	const ongoingStays: Item[] = [];
	const timelineEntries: DayTimelineEntry<Item>[] = [];
	const bounds = dayBounds(date, timeZone);

	for (const item of items) {
		const plan = resolveItemPlanTemporalSource(item);
		if (item.type === 'accommodation' && plan) {
			const checkInAt = timingStartTimestamp(plan.timing);
			if (isOngoingAccommodation(plan.timing, bounds)) {
				ongoingStays.push(item);
			} else if (isTimestampOnDay(checkInAt, bounds)) {
				arrivingStays.push(item);
			}

			if (plan.timing.kind === 'exact' && plan.timing.timePrecision !== 'date') {
				if (isTimestampOnDay(plan.timing.startAt, bounds)) {
					timelineEntries.push({ boundary: 'check-in', item, kind: 'stay-boundary', timestamp: plan.timing.startAt });
				}
				if (plan.timing.endAt !== undefined && isTimestampOnDay(plan.timing.endAt, bounds)) {
					timelineEntries.push({ boundary: 'check-out', item, kind: 'stay-boundary', timestamp: plan.timing.endAt });
				}
			}
		} else if (plan) {
			const chronologicalPosition = resolveItemDayChronologicalPosition(item, date, timeZone);
			if (!chronologicalPosition) {
				throw new Error(`Planned item ${item.id} has no chronological day position.`);
			}
			timelineEntries.push({
				item,
				kind: 'item',
				timestamp: chronologicalPosition.at
			});
		} else {
			const chronologicalPosition = resolveItemDayChronologicalPosition(item, date, timeZone);
			timelineEntries.push({
				item,
				kind: 'item',
				...(chronologicalPosition ? { timestamp: chronologicalPosition.at } : {})
			});
		}
	}

	timelineEntries.sort(timelineEntryOrder);
	return { arrivingStays, ongoingStays, timelineEntries };
}
export function timingStartDate(timing: ItineraryTiming, timeZone?: string): string {
	return resolvePlanStartDate(timing, timeZone);
}

function comparePlacedItemsOnLocalDay<Item extends PlacedItem>(
	date: string,
	timeZone: string | undefined,
	left: Item,
	right: Item
): number {
	const leftPosition = resolveItemDayChronologicalPosition(left, date, timeZone);
	const rightPosition = resolveItemDayChronologicalPosition(right, date, timeZone);
	if (!leftPosition || !rightPosition) {
		if (leftPosition !== rightPosition) {
			return leftPosition ? -1 : 1;
		}
		return left.id.localeCompare(right.id);
	}
	return leftPosition.at - rightPosition.at || left.id.localeCompare(right.id);
}

function itemDateBounds<Item extends PlacedItem>(item: Item, timeZone: string | undefined): [string, string] {
	const membership = resolveItemCalendarDayMembership(item, timeZone);
	if (!membership) {
		throw new Error(`Item ${item.id} has neither a plan nor a day placement.`);
	}
	return [membership.startDate, membership.endDate];
}

function itemsByLocalDay<Item extends PlacedItem>(items: Item[], timeZone?: string): Map<string, Item[]> {
	const days = new Map<string, Item[]>();

	for (const item of items) {
		const [startDate, endDate] = itemDateBounds(item, timeZone);
		let date = startDate;

		while (date <= endDate) {
			const dayItems = days.get(date);
			if (dayItems) {
				dayItems.push(item);
			} else {
				days.set(date, [item]);
			}
			const followingDate = addCalendarDays(date, 1);
			if (!followingDate) {
				throw new Error(`Calendar day ${date} cannot be incremented.`);
			}
			date = followingDate;
		}
	}

	for (const [date, dayItems] of days) {
		dayItems.sort((left, right) => comparePlacedItemsOnLocalDay(date, timeZone, left, right));
	}

	return days;
}

export function groupItemsByLocalDay<Item extends PlacedItem>(
	items: Item[],
	timeZone?: string
): LocalItineraryDay<Item>[] {
	return [...itemsByLocalDay(items, timeZone).entries()]
		.sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
		.map(([date, dayItems]) => ({ date, items: dayItems }));
}

export function formatLocalDay(
	date: string,
	format: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat
): string {
	const formatted = formatCalendarDate(date, format, locale, dateFormat);
	if (!formatted) {
		throw new Error(`Calendar day ${date} cannot be formatted.`);
	}
	return formatted;
}

export function getItineraryDateRange<Item extends PlacedItem>(
	items: Item[],
	timeZone?: string
): [string, string] | null {
	const firstItem = items[0];
	if (!firstItem) {
		return null;
	}

	let [earliest, latest] = itemDateBounds(firstItem, timeZone);
	for (const item of items.slice(1)) {
		const [startDate, endDate] = itemDateBounds(item, timeZone);
		earliest = startDate < earliest ? startDate : earliest;
		latest = endDate > latest ? endDate : latest;
	}
	return [earliest, latest];
}

/** Returns the inclusive number of local calendar days covered by the itinerary. */
export function getLocalItineraryDayCount<Item extends PlacedItem>(items: Item[], timeZone?: string): number {
	const dateRange = getItineraryDateRange(items, timeZone);
	if (!dateRange) {
		return 0;
	}

	const dayCount = calendarDayCount(...dateRange);
	if (dayCount === null) {
		throw new Error(`Itinerary date range is invalid: ${dateRange.join(' to ')}.`);
	}
	return dayCount;
}

/** Returns every local calendar day covered by the itinerary, including days without items. */
export function getLocalItineraryDays<Item extends PlacedItem>(
	items: Item[],
	timeZone?: string
): LocalItineraryDay<Item>[] {
	const dateRange = getItineraryDateRange(items, timeZone);
	if (!dateRange) {
		return [];
	}

	const [firstDate, lastDate] = dateRange;
	const groupedItems = itemsByLocalDay(items, timeZone);
	const days: LocalItineraryDay<Item>[] = [];
	let date = firstDate;
	while (date <= lastDate) {
		days.push({ date, items: groupedItems.get(date) ?? [] });
		const followingDate = addCalendarDays(date, 1);
		if (!followingDate) {
			throw new Error(`Calendar day ${date} cannot be incremented.`);
		}
		date = followingDate;
	}

	return days;
}

export function defaultItemTimestamp(date: string | undefined, timeZone: string, currentTimestamp: number): number {
	const currentDateTime = formatTimestampForTimeZoneInput(currentTimestamp, timeZone);
	const dateTime = date ? `${date}T09:00` : currentDateTime ? `${currentDateTime.slice(0, 13)}:00` : null;
	const timestamp = dateTime ? zonedDateTimeToUnixMilliseconds(dateTime, timeZone) : null;
	if (timestamp === null) {
		throw new Error(`Cannot create a local default time in ${timeZone}.`);
	}
	return timestamp;
}
