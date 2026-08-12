import { addCalendarDays, formatCalendarDate } from './calendar';
import type { ItineraryTiming } from './schema';
import { formatLocalTimestamp, formatTimestampInTimeZone } from './time';
import { timingEndTimestamp, timingStartTimestamp } from './timing';
import { formatTimestampForTimeZoneInput, zonedDateTimeToUnixMilliseconds } from './zoned-time';

export { timingStartTimestamp as timingAnchor } from './timing';

type TimedItem = Readonly<{
	id: string;
	timing: ItineraryTiming;
}>;

export type LocalItineraryDay<Item extends TimedItem> = Readonly<{
	date: string;
	items: Item[];
}>;

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

export function formatLocalDay(date: string): string {
	const formatted = formatCalendarDate(date);
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
