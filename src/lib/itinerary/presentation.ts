import { addCalendarDays, formatCalendarDate, type CalendarDateFormat, type CalendarLocale } from './calendar';
import { defaultFormatPreferences, type DateFormat } from '$lib/format-preferences';
import type { ItineraryItem, ItineraryTiming } from './schema';
import { formatLocalTimestamp, formatTimestampInTimeZone } from './time';
import { timingEndTimestamp, timingStartTimestamp } from './timing';
import { formatTimestampForTimeZoneInput, zonedDateTimeToUnixMilliseconds } from './zoned-time';

export { timingStartTimestamp as timingAnchor } from './timing';

type TimedItem = Readonly<{
	id: string;
	timing: ItineraryTiming;
}>;
type ItemWithType = Readonly<{
	type: ItineraryItem['type'];
}>;
type TimedItemWithType = TimedItem & ItemWithType;

export type LocalItineraryDay<Item extends TimedItem> = Readonly<{
	date: string;
	items: Item[];
}>;

export type DayTimelineEntry<Item extends TimedItemWithType> =
	| Readonly<{
			item: Item;
			kind: 'item';
			timestamp: number;
	  }>
	| Readonly<{
			boundary: 'check-in' | 'check-out';
			item: Item;
			kind: 'stay-boundary';
			timestamp: number;
	  }>;

export type DayItemPartition<Item extends TimedItemWithType> = Readonly<{
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

function timelineEntryOrder<Item extends TimedItemWithType>(
	left: DayTimelineEntry<Item>,
	right: DayTimelineEntry<Item>
): number {
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
export function partitionDayItems<Item extends TimedItemWithType>(
	items: readonly Item[],
	date: string,
	timeZone: string
): DayItemPartition<Item> {
	const arrivingStays: Item[] = [];
	const ongoingStays: Item[] = [];
	const timelineEntries: DayTimelineEntry<Item>[] = [];
	const bounds = dayBounds(date, timeZone);

	for (const item of items) {
		if (item.type === 'accommodation') {
			const checkInAt = timingStartTimestamp(item.timing);
			if (isOngoingAccommodation(item.timing, bounds)) {
				ongoingStays.push(item);
			} else if (isTimestampOnDay(checkInAt, bounds)) {
				arrivingStays.push(item);
			}

			if (item.timing.kind === 'exact' && item.timing.timePrecision !== 'date') {
				if (isTimestampOnDay(item.timing.startAt, bounds)) {
					timelineEntries.push({ boundary: 'check-in', item, kind: 'stay-boundary', timestamp: item.timing.startAt });
				}
				if (item.timing.endAt !== undefined && isTimestampOnDay(item.timing.endAt, bounds)) {
					timelineEntries.push({ boundary: 'check-out', item, kind: 'stay-boundary', timestamp: item.timing.endAt });
				}
			}
		} else {
			timelineEntries.push({
				item,
				kind: 'item',
				timestamp: timingTimestampOnLocalDay(item.timing, date, timeZone)
			});
		}
	}

	timelineEntries.sort(timelineEntryOrder);
	return { arrivingStays, ongoingStays, timelineEntries };
}

function timestampForViewer(timestamp: number, timeZone: string | undefined) {
	return timeZone ? formatTimestampInTimeZone(timestamp, timeZone) : formatLocalTimestamp(timestamp);
}

function localDateForTimestamp(timestamp: number, timeZone: string | undefined): string {
	const formatted = timestampForViewer(timestamp, timeZone);
	if (!formatted) {
		throw new Error(`Item timestamp ${timestamp} cannot be localized.`);
	}
	return formatted.date;
}

export function timingStartDate(timing: ItineraryTiming, timeZone?: string): string {
	return localDateForTimestamp(timingStartTimestamp(timing), timeZone);
}

function timingDateBounds(timing: ItineraryTiming, timeZone: string | undefined): [string, string] {
	switch (timing.kind) {
		case 'exact':
			return [
				localDateForTimestamp(timing.startAt, timeZone),
				localDateForTimestamp(timing.endAt ?? timing.startAt, timeZone)
			];
		case 'approximate': {
			const toleranceMilliseconds = timing.toleranceMinutes * 60_000;
			return [
				localDateForTimestamp(timing.nominalAt - toleranceMilliseconds, timeZone),
				localDateForTimestamp(timing.nominalAt + toleranceMilliseconds, timeZone)
			];
		}
		case 'window':
			return [localDateForTimestamp(timing.earliestAt, timeZone), localDateForTimestamp(timing.latestAt, timeZone)];
	}
}

function timingTimestampOnLocalDay(timing: ItineraryTiming, date: string, timeZone: string | undefined): number {
	const [startDate, endDate] = timingDateBounds(timing, timeZone);
	return date === endDate && startDate !== endDate ? timingEndTimestamp(timing) : timingStartTimestamp(timing);
}

function compareTimedItemsOnLocalDay<Item extends TimedItem>(
	date: string,
	timeZone: string | undefined,
	left: Item,
	right: Item
): number {
	return (
		timingTimestampOnLocalDay(left.timing, date, timeZone) - timingTimestampOnLocalDay(right.timing, date, timeZone) ||
		left.id.localeCompare(right.id)
	);
}

function itemsByLocalDay<Item extends TimedItem>(items: Item[], timeZone?: string): Map<string, Item[]> {
	const days = new Map<string, Item[]>();

	for (const item of items) {
		const [startDate, endDate] = timingDateBounds(item.timing, timeZone);
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
		dayItems.sort((left, right) => compareTimedItemsOnLocalDay(date, timeZone, left, right));
	}

	return days;
}

export function groupItemsByLocalDay<Item extends TimedItem>(
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

export function getItineraryDateRange(items: TimedItem[], timeZone?: string): [string, string] | null {
	const firstItem = items[0];
	if (!firstItem) {
		return null;
	}

	let [earliest, latest] = timingDateBounds(firstItem.timing, timeZone);
	for (const item of items.slice(1)) {
		const [startDate, endDate] = timingDateBounds(item.timing, timeZone);
		earliest = startDate < earliest ? startDate : earliest;
		latest = endDate > latest ? endDate : latest;
	}
	return [earliest, latest];
}

/** Returns every local calendar day covered by the itinerary, including days without items. */
export function getLocalItineraryDays<Item extends TimedItem>(
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
