import { defaultFormatPreferences, formatTime, type FormatPreferences } from '$lib/format-preferences';
import { formatCalendarDate, formatCalendarDateTime, type CalendarDateFormat, type CalendarLocale } from './calendar';
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

export type TimingBoundary = 'end' | 'start';

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

function timestampLabel(
	timestamp: number,
	includeDate: boolean,
	timeZone: string | undefined,
	calendarDateFormat: CalendarDateFormat,
	locale: CalendarLocale,
	formatPreferences: FormatPreferences
): string | null {
	const formatted = formatTimestamp(timestamp, timeZone);
	if (!formatted) {
		return null;
	}
	if (!includeDate) {
		return formatTime(formatted.time, formatPreferences.timeFormat);
	}

	return formatCalendarDateTime(
		formatted.date,
		formatted.time,
		calendarDateFormat,
		locale,
		formatPreferences.dateFormat,
		formatPreferences.timeFormat
	);
}

function timestampRangeLabel(
	startAt: number,
	endAt: number,
	includeDate: boolean,
	timeZone: string | undefined,
	calendarDateFormat: CalendarDateFormat,
	locale: CalendarLocale,
	formatPreferences: FormatPreferences
): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	if (!start || !end) {
		return null;
	}
	const startTime = formatTime(start.time, formatPreferences.timeFormat);
	const endTime = formatTime(end.time, formatPreferences.timeFormat);
	if (!includeDate || start.date === end.date) {
		return `${startTime}–${endTime}`;
	}

	const startDate = formatCalendarDate(start.date, calendarDateFormat, locale, formatPreferences.dateFormat);
	const endDate = formatCalendarDate(end.date, calendarDateFormat, locale, formatPreferences.dateFormat);
	return startDate && endDate ? `${startDate}, ${startTime} – ${endDate}, ${endTime}` : null;
}

function dateRangeLabel(
	startAt: number,
	endAt: number,
	timeZone: string | undefined,
	calendarDateFormat: CalendarDateFormat,
	locale: CalendarLocale,
	formatPreferences: FormatPreferences
): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	if (!start || !end) {
		return null;
	}
	const startDate = formatCalendarDate(start.date, calendarDateFormat, locale, formatPreferences.dateFormat);
	const endDate = formatCalendarDate(end.date, calendarDateFormat, locale, formatPreferences.dateFormat);
	if (!startDate || !endDate) {
		return null;
	}
	return start.date === end.date ? `${startDate} · time unknown` : `${startDate} – ${endDate} · times unknown`;
}

function accommodationDateRangeLabel(
	startAt: number,
	endAt: number,
	timeZone: string | undefined,
	calendarDateFormat: CalendarDateFormat,
	locale: CalendarLocale,
	formatPreferences: FormatPreferences
): string | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	if (!start || !end) {
		return null;
	}
	const startDate = formatCalendarDate(start.date, calendarDateFormat, locale, formatPreferences.dateFormat);
	const endDate = formatCalendarDate(end.date, calendarDateFormat, locale, formatPreferences.dateFormat);
	return startDate && endDate ? `Check-in ${startDate} · Check-out ${endDate} · times unknown` : null;
}

export type TimingDisplayPart = Readonly<{
	label?: 'Check-in' | 'Check-out';
	value: string;
}>;

type TimingDayPosition = 'both' | 'continues' | 'end' | 'start';

type TimingDayRange = Readonly<{
	endTime: string;
	position: TimingDayPosition;
	startTime: string;
}>;

function timingPositionForDay(
	startAt: number,
	endAt: number,
	date: string,
	dayTimeZone: string | undefined
): TimingDayPosition | null {
	const dayStart = formatTimestamp(startAt, dayTimeZone);
	const dayEnd = formatTimestamp(endAt, dayTimeZone);
	if (!dayStart || !dayEnd || date < dayStart.date || date > dayEnd.date) {
		return null;
	}
	if (dayStart.date === dayEnd.date) {
		return startAt === endAt ? 'start' : 'both';
	}
	if (date === dayStart.date) {
		return 'start';
	}
	if (date === dayEnd.date) {
		return 'end';
	}
	return 'continues';
}

function timingRangeForDay(
	startAt: number,
	endAt: number,
	date: string,
	timeZone: string | undefined,
	dayTimeZone: string | undefined,
	formatPreferences: FormatPreferences
): TimingDayRange | null {
	const start = formatTimestamp(startAt, timeZone);
	const end = formatTimestamp(endAt, timeZone);
	const position = timingPositionForDay(startAt, endAt, date, dayTimeZone);
	if (!start || !end || !position) {
		return null;
	}
	return {
		endTime: formatTime(end.time, formatPreferences.timeFormat),
		position,
		startTime: formatTime(start.time, formatPreferences.timeFormat)
	};
}

function timingRangeLabelForDay(
	startAt: number,
	endAt: number,
	date: string,
	prefix: string,
	timeZone: string | undefined,
	dayTimeZone: string | undefined,
	formatPreferences: FormatPreferences
): string | null {
	const range = timingRangeForDay(startAt, endAt, date, timeZone, dayTimeZone, formatPreferences);
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

export function formatItineraryTiming(
	timing: ItineraryTiming,
	includeDate = false,
	timeZone?: string,
	calendarDateFormat: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): string | null {
	switch (timing.kind) {
		case 'exact':
			if (timing.timePrecision === 'date') {
				return dateRangeLabel(
					timing.startAt,
					timing.endAt ?? timing.startAt,
					timeZone,
					calendarDateFormat,
					locale,
					formatPreferences
				);
			}
			return timing.endAt === undefined
				? timestampLabel(timing.startAt, includeDate, timeZone, calendarDateFormat, locale, formatPreferences)
				: timestampRangeLabel(
						timing.startAt,
						timing.endAt,
						includeDate,
						timeZone,
						calendarDateFormat,
						locale,
						formatPreferences
					);
		case 'approximate': {
			const nominal = timestampLabel(
				timing.nominalAt,
				includeDate,
				timeZone,
				calendarDateFormat,
				locale,
				formatPreferences
			);
			return nominal ? `~${nominal} ±${toleranceLabel(timing.toleranceMinutes)}` : null;
		}
		case 'window': {
			const window = timestampRangeLabel(
				timing.earliestAt,
				timing.latestAt,
				includeDate,
				timeZone,
				calendarDateFormat,
				locale,
				formatPreferences
			);
			return window ? `~${window}` : null;
		}
	}
}

/** Formats one known item boundary without treating an uncertain time range as an item end. */
export function formatItineraryTimingBoundary(
	timing: ItineraryTiming,
	boundary: TimingBoundary,
	includeDate = false,
	timeZone?: string,
	calendarDateFormat: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): string | null {
	switch (timing.kind) {
		case 'exact': {
			const timestamp = boundary === 'start' ? timing.startAt : timing.endAt;
			if (timestamp === undefined) {
				return null;
			}
			if (timing.timePrecision === 'date') {
				const formatted = formatTimestamp(timestamp, timeZone);
				const date = formatted
					? formatCalendarDate(formatted.date, calendarDateFormat, locale, formatPreferences.dateFormat)
					: null;
				return date ? `${date} · time unknown` : null;
			}
			return timestampLabel(timestamp, includeDate, timeZone, calendarDateFormat, locale, formatPreferences);
		}
		case 'approximate':
		case 'window':
			return boundary === 'start'
				? formatItineraryTiming(timing, includeDate, timeZone, calendarDateFormat, locale, formatPreferences)
				: null;
	}
}

function timingDisplayPartsLabel(parts: readonly TimingDisplayPart[]): string {
	return parts.map((part) => (part.label ? `${part.label} ${part.value}` : part.value)).join(' · ');
}

/** Returns the check-in and check-out timing display parts for an accommodation item. */
export function formatAccommodationTimingParts(
	timing: ItineraryTiming,
	includeDate = false,
	timeZone?: string,
	calendarDateFormat: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): readonly TimingDisplayPart[] | null {
	if (timing.kind !== 'exact' || timing.timePrecision === 'date') {
		return null;
	}
	const start = timestampLabel(timing.startAt, includeDate, timeZone, calendarDateFormat, locale, formatPreferences);
	if (!start) {
		return null;
	}
	if (timing.endAt === undefined) {
		return [{ label: 'Check-in', value: start }];
	}
	const end = timestampLabel(timing.endAt, includeDate, timeZone, calendarDateFormat, locale, formatPreferences);
	return end
		? [
				{ label: 'Check-in', value: start },
				{ label: 'Check-out', value: end }
			]
		: null;
}

/** Formats accommodation timings with explicit check-in and check-out boundaries. */
export function formatAccommodationTiming(
	timing: ItineraryTiming,
	includeDate = false,
	timeZone?: string,
	calendarDateFormat: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): string | null {
	if (timing.kind !== 'exact') {
		return formatItineraryTiming(timing, includeDate, timeZone, calendarDateFormat, locale, formatPreferences);
	}
	if (timing.timePrecision === 'date') {
		return accommodationDateRangeLabel(
			timing.startAt,
			timing.endAt ?? timing.startAt,
			timeZone,
			calendarDateFormat,
			locale,
			formatPreferences
		);
	}
	const parts = formatAccommodationTimingParts(
		timing,
		includeDate,
		timeZone,
		calendarDateFormat,
		locale,
		formatPreferences
	);
	return parts ? timingDisplayPartsLabel(parts) : null;
}

/** Formats only the timing information relevant to one viewer-local itinerary day. */
export function formatItineraryTimingForDay(
	timing: ItineraryTiming,
	date: string,
	timeZone?: string,
	dayTimeZone: string | undefined = timeZone,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): string | null {
	switch (timing.kind) {
		case 'exact':
			if (timing.timePrecision === 'date') {
				const position = timingPositionForDay(timing.startAt, timing.endAt ?? timing.startAt, date, dayTimeZone);
				switch (position) {
					case 'both':
					case 'start':
						return 'Check-in time unknown';
					case 'end':
						return 'Check-out time unknown';
					case 'continues':
						return 'Stay continues';
					case null:
						return null;
				}
			}
			return timingRangeLabelForDay(
				timing.startAt,
				timing.endAt ?? timing.startAt,
				date,
				'',
				timeZone,
				dayTimeZone,
				formatPreferences
			);
		case 'approximate': {
			const toleranceMilliseconds = timing.toleranceMinutes * 60_000;
			return timingRangeLabelForDay(
				timing.nominalAt - toleranceMilliseconds,
				timing.nominalAt + toleranceMilliseconds,
				date,
				'~',
				timeZone,
				dayTimeZone,
				formatPreferences
			);
		}
		case 'window':
			return timingRangeLabelForDay(
				timing.earliestAt,
				timing.latestAt,
				date,
				'~',
				timeZone,
				dayTimeZone,
				formatPreferences
			);
	}
}

/** Returns the check-in or check-out timing display part relevant to one viewer-local itinerary day. */
export function formatAccommodationTimingForDayParts(
	timing: ItineraryTiming,
	date: string,
	timeZone?: string,
	dayTimeZone: string | undefined = timeZone,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): readonly TimingDisplayPart[] | null {
	if (timing.kind !== 'exact') {
		return null;
	}
	if (timing.timePrecision === 'date') {
		const position = timingPositionForDay(timing.startAt, timing.endAt ?? timing.startAt, date, dayTimeZone);
		switch (position) {
			case 'both':
			case 'start':
				return [{ label: 'Check-in', value: 'time unknown' }];
			case 'end':
				return [{ label: 'Check-out', value: 'time unknown' }];
			case 'continues':
			case null:
				return null;
		}
	}
	const range = timingRangeForDay(
		timing.startAt,
		timing.endAt ?? timing.startAt,
		date,
		timeZone,
		dayTimeZone,
		formatPreferences
	);
	if (!range) {
		return null;
	}
	switch (range.position) {
		case 'both':
			return [
				{ label: 'Check-in', value: range.startTime },
				{ label: 'Check-out', value: range.endTime }
			];
		case 'start':
			return [{ label: 'Check-in', value: range.startTime }];
		case 'end':
			return [{ label: 'Check-out', value: range.endTime }];
		case 'continues':
			return null;
	}
}

/** Formats accommodation timing relevant to one viewer-local itinerary day. */
export function formatAccommodationTimingForDay(
	timing: ItineraryTiming,
	date: string,
	timeZone?: string,
	dayTimeZone: string | undefined = timeZone,
	formatPreferences: FormatPreferences = defaultFormatPreferences
): string | null {
	if (timing.kind !== 'exact') {
		return formatItineraryTimingForDay(timing, date, timeZone, dayTimeZone, formatPreferences);
	}
	const parts = formatAccommodationTimingForDayParts(timing, date, timeZone, dayTimeZone, formatPreferences);
	return parts ? timingDisplayPartsLabel(parts) : null;
}
