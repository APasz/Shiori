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

function accommodationDateRangeLabel(startAt: number, endAt: number, timeZone: string | undefined): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	if (!start || !end) {
		return null;
	}
	const startDate = formatCalendarDate(start.date);
	const endDate = formatCalendarDate(end.date);
	return startDate && endDate ? `Check-in ${startDate} · Check-out ${endDate} · times unknown` : null;
}

export type TimingDisplayPart = Readonly<{
	label?: 'From' | 'To';
	value: string;
}>;

type TimingDayRange = Readonly<{
	endTime: string;
	position: 'both' | 'continues' | 'end' | 'start';
	startTime: string;
}>;

function timingRangeForDay(
	startAt: number,
	endAt: number,
	date: string,
	timeZone: string | undefined,
	dayTimeZone: string | undefined
): TimingDayRange | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	const dayStart = formatTimestamp(startAt, dayTimeZone);
	const dayEnd = formatTimestamp(endAt, dayTimeZone);
	if (!start || !end || !dayStart || !dayEnd || date < dayStart.date || date > dayEnd.date) {
		return null;
	}
	if (dayStart.date === dayEnd.date) {
		return { endTime: end.time, position: startAt === endAt ? 'start' : 'both', startTime: start.time };
	}
	if (date === dayStart.date) {
		return { endTime: end.time, position: 'start', startTime: start.time };
	}
	if (date === dayEnd.date) {
		return { endTime: end.time, position: 'end', startTime: start.time };
	}
	return { endTime: end.time, position: 'continues', startTime: start.time };
}

function timingRangeLabelForDay(
	startAt: number,
	endAt: number,
	date: string,
	prefix: string,
	timeZone: string | undefined,
	dayTimeZone: string | undefined
): string | null {
	const range = timingRangeForDay(startAt, endAt, date, timeZone, dayTimeZone);
	if (!range) {
		return null;
	}
	switch (range.position) {
		case 'both':
			return `${prefix}${range.startTime}–${range.endTime}`;
		case 'start':
			return `${prefix}${range.startTime}`;
		case 'end':
			return `${prefix}${range.endTime}`;
		case 'continues':
			return 'Continues';
	}
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

function timingDisplayPartsLabel(parts: readonly TimingDisplayPart[]): string {
	return parts.map((part) => (part.label ? `${part.label} ${part.value}` : part.value)).join(' · ');
}

/** Returns the check-in and check-out timing display parts for an accommodation item. */
export function formatAccommodationTimingParts(
	timing: ItineraryTiming,
	includeDate = false,
	timeZone?: string
): readonly TimingDisplayPart[] | null {
	if (timing.kind !== 'exact' || timing.timePrecision === 'date') {
		return null;
	}
	const start = timestampLabel(timing.startAt, includeDate, timeZone);
	if (!start) {
		return null;
	}
	if (timing.endAt === undefined) {
		return [{ label: 'From', value: start }];
	}
	const end = timestampLabel(timing.endAt, includeDate, timeZone);
	return end
		? [
				{ label: 'From', value: start },
				{ label: 'To', value: end }
			]
		: null;
}

/** Formats accommodation timings with explicit check-in and check-out boundaries. */
export function formatAccommodationTiming(
	timing: ItineraryTiming,
	includeDate = false,
	timeZone?: string
): string | null {
	if (timing.kind !== 'exact') {
		return formatItineraryTiming(timing, includeDate, timeZone);
	}
	if (timing.timePrecision === 'date') {
		return accommodationDateRangeLabel(timing.startAt, timing.endAt ?? timing.startAt, timeZone);
	}
	const parts = formatAccommodationTimingParts(timing, includeDate, timeZone);
	return parts ? timingDisplayPartsLabel(parts) : null;
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

/** Returns the check-in or check-out timing display part relevant to one viewer-local itinerary day. */
export function formatAccommodationTimingForDayParts(
	timing: ItineraryTiming,
	date: string,
	timeZone?: string,
	dayTimeZone: string | undefined = timeZone
): readonly TimingDisplayPart[] | null {
	if (timing.kind !== 'exact' || timing.timePrecision === 'date') {
		return null;
	}
	const range = timingRangeForDay(timing.startAt, timing.endAt ?? timing.startAt, date, timeZone, dayTimeZone);
	if (!range) {
		return null;
	}
	switch (range.position) {
		case 'both':
			return [
				{ label: 'From', value: range.startTime },
				{ label: 'To', value: range.endTime }
			];
		case 'start':
			return [{ label: 'From', value: range.startTime }];
		case 'end':
			return [{ label: 'To', value: range.endTime }];
		case 'continues':
			return [{ value: 'Stay continues' }];
	}
}

/** Formats accommodation timing relevant to one viewer-local itinerary day. */
export function formatAccommodationTimingForDay(
	timing: ItineraryTiming,
	date: string,
	timeZone?: string,
	dayTimeZone: string | undefined = timeZone
): string | null {
	if (timing.kind !== 'exact') {
		return formatItineraryTimingForDay(timing, date, timeZone, dayTimeZone);
	}
	if (timing.timePrecision === 'date') {
		return formatItineraryTimingForDay(timing, date, timeZone, dayTimeZone);
	}
	const parts = formatAccommodationTimingForDayParts(timing, date, timeZone, dayTimeZone);
	return parts ? timingDisplayPartsLabel(parts) : null;
}
