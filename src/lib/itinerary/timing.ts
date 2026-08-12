import { formatCalendarDate } from './calendar';
import type { ItineraryTiming } from './schema';
import { formatLocalTimestamp, formatTimestampInTimeZone } from './time';

export function timingStartTimestamp(timing: ItineraryTiming): number {
	switch (timing.kind) {
		case 'exact':
			return timing.startAt;
		case 'approximate':
			return timing.nominalAt;
		case 'window':
			return timing.earliestAt;
	}
}

export function timingEndTimestamp(timing: ItineraryTiming): number {
	switch (timing.kind) {
		case 'exact':
			return timing.endAt ?? timing.startAt;
		case 'approximate':
			return timing.nominalAt + timing.toleranceMinutes * 60_000;
		case 'window':
			return timing.latestAt;
	}
}

function toleranceLabel(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	if (hours === 0) {
		return `${minutes}m`;
	}
	return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

function formatTimestamp(timestamp: number, timeZone: string | undefined) {
	return timeZone ? formatTimestampInTimeZone(timestamp, timeZone) : formatLocalTimestamp(timestamp);
}

function timestampLabel(timestamp: number, includeDate: boolean, timeZone: string | undefined): string | null {
	const formatted = formatTimestamp(timestamp, timeZone);
	if (!formatted) {
		return null;
	}
	if (!includeDate) {
		return formatted.time;
	}

	const date = formatCalendarDate(formatted.date);
	return date ? `${date}, ${formatted.time}` : null;
}

function timestampRangeLabel(
	startAt: number,
	endAt: number,
	includeDate: boolean,
	timeZone: string | undefined
): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	if (!start || !end) {
		return null;
	}
	if (!includeDate || start.date === end.date) {
		return `${start.time}–${end.time}`;
	}

	const startDate = formatCalendarDate(start.date);
	const endDate = formatCalendarDate(end.date);
	return startDate && endDate ? `${startDate}, ${start.time} – ${endDate}, ${end.time}` : null;
}

function dateRangeLabel(startAt: number, endAt: number, timeZone: string | undefined): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	if (!start || !end) {
		return null;
	}
	const startDate = formatCalendarDate(start.date);
	const endDate = formatCalendarDate(end.date);
	if (!startDate || !endDate) {
		return null;
	}
	return start.date === end.date ? `${startDate} · time unknown` : `${startDate} – ${endDate} · times unknown`;
}

function timingRangeLabelForDay(
	startAt: number,
	endAt: number,
	date: string,
	prefix: string,
	timeZone: string | undefined,
	dayTimeZone: string | undefined
): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	const dayStart = formatTimestamp(startAt, dayTimeZone);
	const dayEnd = formatTimestamp(endAt, dayTimeZone);
	if (!start || !end || !dayStart || !dayEnd || date < dayStart.date || date > dayEnd.date) {
		return null;
	}
	if (dayStart.date === dayEnd.date) {
		return startAt === endAt ? `${prefix}${start.time}` : `${prefix}${start.time}–${end.time}`;
	}
	if (date === dayStart.date) {
		return `${prefix}${start.time}`;
	}
	if (date === dayEnd.date) {
		return `${prefix}${end.time}`;
	}
	return 'Continues';
}

export function formatItineraryTiming(timing: ItineraryTiming, includeDate = false, timeZone?: string): string | null {
	switch (timing.kind) {
		case 'exact':
			if (timing.timePrecision === 'date') {
				return dateRangeLabel(timing.startAt, timing.endAt ?? timing.startAt, timeZone);
			}
			return timing.endAt === undefined
				? timestampLabel(timing.startAt, includeDate, timeZone)
				: timestampRangeLabel(timing.startAt, timing.endAt, includeDate, timeZone);
		case 'approximate': {
			const nominal = timestampLabel(timing.nominalAt, includeDate, timeZone);
			return nominal ? `~${nominal} ±${toleranceLabel(timing.toleranceMinutes)}` : null;
		}
		case 'window': {
			const window = timestampRangeLabel(timing.earliestAt, timing.latestAt, includeDate, timeZone);
			return window ? `~${window}` : null;
		}
	}
}

/** Formats only the timing information relevant to one viewer-local itinerary day. */
export function formatItineraryTimingForDay(
	timing: ItineraryTiming,
	date: string,
	timeZone?: string,
	dayTimeZone: string | undefined = timeZone
): string | null {
	switch (timing.kind) {
		case 'exact':
			if (timing.timePrecision === 'date') {
				const dayStart = formatTimestamp(timing.startAt, dayTimeZone);
				const dayEnd = formatTimestamp(timing.endAt ?? timing.startAt, dayTimeZone);
				if (!dayStart || !dayEnd || date < dayStart.date || date > dayEnd.date) {
					return null;
				}
				if (dayStart.date === dayEnd.date || date === dayStart.date) {
					return 'Check-in time unknown';
				}
				return date === dayEnd.date ? 'Check-out time unknown' : 'Stay continues';
			}
			return timingRangeLabelForDay(timing.startAt, timing.endAt ?? timing.startAt, date, '', timeZone, dayTimeZone);
		case 'approximate': {
			const toleranceMilliseconds = timing.toleranceMinutes * 60_000;
			return timingRangeLabelForDay(
				timing.nominalAt - toleranceMilliseconds,
				timing.nominalAt + toleranceMilliseconds,
				date,
				'~',
				timeZone,
				dayTimeZone
			);
		}
		case 'window':
			return timingRangeLabelForDay(timing.earliestAt, timing.latestAt, date, '~', timeZone, dayTimeZone);
	}
}
