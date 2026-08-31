import { defaultFormatPreferences, formatTime, type DateFormat, type TimeFormat } from '$lib/format-preferences';

export type CalendarDay = Readonly<{
	date: string;
	day: number;
	inCurrentMonth: boolean;
}>;

export type CalendarMonth = Readonly<{
	month: number;
	year: number;
}>;

export type CalendarDateFormat = 'date' | 'date-with-weekday';

export type CalendarLocale = string | null;

/** A locale whose short date representation uses the ISO calendar order. */
export const isoDateLocale = 'en-CA-u-ca-iso8601';

const calendarDatePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;
const millisecondsPerDay = 86_400_000;
const calendarFormatters = new Map<string, Intl.DateTimeFormat>();
const australianEnglishLocales = new Map<string, boolean>();

type CalendarFormatterFormat = CalendarDateFormat | 'month' | 'weekday';

function padded(value: number): string {
	return String(value).padStart(2, '0');
}

function calendarDateParts(value: string): Readonly<{ day: number; month: number; year: number }> | null {
	const matched = calendarDatePattern.exec(value);
	if (!matched?.groups) {
		return null;
	}

	const day = Number(matched.groups.day);
	const month = Number(matched.groups.month);
	const year = Number(matched.groups.year);
	const timestamp = Date.UTC(year, month - 1, day);
	const date = new Date(timestamp);
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
		? { day, month, year }
		: null;
}

function calendarDateFromTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getUTCFullYear()}-${padded(date.getUTCMonth() + 1)}-${padded(date.getUTCDate())}`;
}

export function calendarMonthForDate(value: string): CalendarMonth | null {
	const parts = calendarDateParts(value);
	return parts ? { month: parts.month, year: parts.year } : null;
}

export function currentCalendarMonth(now = new Date()): CalendarMonth {
	return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function addCalendarMonths(month: CalendarMonth, amount: number): CalendarMonth {
	const date = new Date(Date.UTC(month.year, month.month - 1 + amount, 1));
	return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

export function addCalendarDays(value: string, amount: number): string | null {
	const parts = calendarDateParts(value);
	return parts ? calendarDateFromTimestamp(Date.UTC(parts.year, parts.month - 1, parts.day + amount)) : null;
}

/** Counts inclusive calendar days, or returns null when either date is invalid or reversed. */
export function calendarDayCount(first: string, last: string): number | null {
	const firstParts = calendarDateParts(first);
	const lastParts = calendarDateParts(last);
	if (!firstParts || !lastParts) {
		return null;
	}

	const firstTimestamp = Date.UTC(firstParts.year, firstParts.month - 1, firstParts.day);
	const lastTimestamp = Date.UTC(lastParts.year, lastParts.month - 1, lastParts.day);
	return lastTimestamp >= firstTimestamp ? (lastTimestamp - firstTimestamp) / millisecondsPerDay + 1 : null;
}

export function calendarDays(month: CalendarMonth): CalendarDay[] {
	const firstDayTimestamp = Date.UTC(month.year, month.month - 1, 1);
	const firstDay = new Date(firstDayTimestamp);
	const daysBeforeMonday = (firstDay.getUTCDay() + 6) % 7;

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(firstDayTimestamp + (index - daysBeforeMonday) * 86_400_000);
		return {
			date: calendarDateFromTimestamp(date.getTime()),
			day: date.getUTCDate(),
			inCurrentMonth: date.getUTCMonth() === month.month - 1
		};
	});
}

export function isAustralianEnglishLocale(locale: CalendarLocale): boolean {
	if (locale === null) {
		return false;
	}
	const existing = australianEnglishLocales.get(locale);
	if (existing !== undefined) {
		return existing;
	}

	let isAustralianEnglish = false;
	try {
		const parsed = new Intl.Locale(locale);
		isAustralianEnglish = parsed.language === 'en' && parsed.region === 'AU';
	} catch {
		// An invalid locale uses the ISO fallback instead.
	}

	australianEnglishLocales.set(locale, isAustralianEnglish);
	return isAustralianEnglish;
}

/** Returns the locale that gives a date picker the selected field order. */
export function datePickerLocale(
	locale: CalendarLocale,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat
): string {
	switch (dateFormat) {
		case 'day-month-year':
			return 'en-AU';
		case 'month-day-year':
			return 'en-US';
		case 'year-month-day':
			return isoDateLocale;
		case 'locale':
			return locale ?? isoDateLocale;
	}
}

/** Returns the hyphen separator used by fixed-format and Australian English date pickers. */
export function datePickerDateSeparator(
	locale: CalendarLocale,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat
): '-' | null {
	return dateFormat === 'locale' && !isAustralianEnglishLocale(locale) ? null : '-';
}

function calendarFormatterOptions(format: CalendarFormatterFormat): Intl.DateTimeFormatOptions {
	switch (format) {
		case 'date':
			return { dateStyle: 'medium', timeZone: 'UTC' };
		case 'date-with-weekday':
			return { day: 'numeric', month: 'short', timeZone: 'UTC', weekday: 'short', year: 'numeric' };
		case 'month':
			return { month: 'long', timeZone: 'UTC', year: 'numeric' };
		case 'weekday':
			return { timeZone: 'UTC', weekday: 'short' };
	}
}

function calendarFormatter(locale: CalendarLocale, format: CalendarFormatterFormat): Intl.DateTimeFormat | null {
	if (locale === null) {
		return null;
	}
	const key = `${locale}:${format}`;
	const existing = calendarFormatters.get(key);
	if (existing) {
		return existing;
	}

	try {
		const formatter = new Intl.DateTimeFormat(locale, calendarFormatterOptions(format));
		calendarFormatters.set(key, formatter);
		return formatter;
	} catch {
		return null;
	}
}

export function formatCalendarMonth(month: CalendarMonth, locale: CalendarLocale = null): string {
	const date = new Date(Date.UTC(month.year, month.month - 1, 1));
	return calendarFormatter(locale, 'month')?.format(date) ?? `${month.year}-${padded(month.month)}`;
}

function fixedDateLabel(
	parts: Readonly<{ day: number; month: number; year: number }>,
	dateFormat: DateFormat
): string | null {
	switch (dateFormat) {
		case 'locale':
			return null;
		case 'day-month-year':
			return `${padded(parts.day)}-${padded(parts.month)}-${parts.year}`;
		case 'month-day-year':
			return `${padded(parts.month)}-${padded(parts.day)}-${parts.year}`;
		case 'year-month-day':
			return `${parts.year}-${padded(parts.month)}-${padded(parts.day)}`;
	}
}

/** Formats a canonical date using the selected order, the user's locale, or ISO when no locale is available. */
export function formatCalendarDate(
	value: string,
	format: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat
): string | null {
	const parts = calendarDateParts(value);
	if (!parts) {
		return null;
	}

	const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
	const dateLabel =
		fixedDateLabel(parts, dateFormat) ??
		(isAustralianEnglishLocale(locale) ? `${padded(parts.day)}-${padded(parts.month)}-${parts.year}` : null);
	if (dateLabel) {
		if (format === 'date') {
			return dateLabel;
		}
		const weekday = calendarFormatter(locale, 'weekday')?.format(date);
		return weekday ? `${dateLabel} (${weekday})` : dateLabel;
	}
	return calendarFormatter(locale, format)?.format(date) ?? value;
}

/** Combines the selected calendar date and clock display conventions. */
export function formatCalendarDateTime(
	date: string,
	time: string,
	format: CalendarDateFormat = 'date',
	locale: CalendarLocale = null,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat,
	timeFormat: TimeFormat = defaultFormatPreferences.timeFormat
): string {
	return `${formatCalendarDate(date, format, locale, dateFormat) ?? date}, ${formatTime(time, timeFormat)}`;
}
