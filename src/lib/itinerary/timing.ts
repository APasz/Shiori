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

export function formatItineraryTiming(timing: ItineraryTiming, includeDate = false, timeZone?: string): string | null {
	switch (timing.kind) {
		case 'exact':
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
