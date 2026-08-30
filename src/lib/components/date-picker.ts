import { parseDate, type CalendarDate } from '@internationalized/date';
import { unixEpochDate } from '$lib/itinerary/unix-time';

export type DayAdjustment = -1 | 1;

export const minimumCalendarDate = unixEpochDate;
export const minimumCalendarDateValue = parseDate(minimumCalendarDate);

/** Parses a complete ISO calendar date for the date-picker controls. */
export function parseCalendarDate(value: string): CalendarDate | undefined {
	try {
		const date = parseDate(value);
		return date.toString() === value ? date : undefined;
	} catch {
		return undefined;
	}
}

/** Returns an adjacent calendar date when it remains within the supported ISO year range. */
export function adjustCalendarDate(date: CalendarDate, adjustment: DayAdjustment): CalendarDate | undefined {
	const adjustedDate = date.add({ days: adjustment });
	return adjustedDate.toString() === date.toString() ? undefined : parseCalendarDate(adjustedDate.toString());
}
