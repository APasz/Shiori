export type CalendarDay = Readonly<{
	date: string;
	day: number;
	inCurrentMonth: boolean;
}>;

export type CalendarMonth = Readonly<{
	month: number;
	year: number;
}>;

const calendarDatePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

function padded(value: number): string {
	return String(value).padStart(2, '0');
}

function calendarDateParts(
	value: string
): Readonly<{ day: number; month: number; year: number }> | null {
	const matched = calendarDatePattern.exec(value);
	if (!matched?.groups) {
		return null;
	}

	const day = Number(matched.groups.day);
	const month = Number(matched.groups.month);
	const year = Number(matched.groups.year);
	const timestamp = Date.UTC(year, month - 1, day);
	const date = new Date(timestamp);
	return date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
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
	return parts
		? calendarDateFromTimestamp(Date.UTC(parts.year, parts.month - 1, parts.day + amount))
		: null;
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

export function formatCalendarMonth(month: CalendarMonth): string {
	return new Intl.DateTimeFormat('en-AU', {
		month: 'long',
		timeZone: 'UTC',
		year: 'numeric'
	}).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
}

export function formatCalendarDate(value: string): string | null {
	const parts = calendarDateParts(value);
	if (!parts) {
		return null;
	}

	return new Intl.DateTimeFormat('en-AU', {
		day: '2-digit',
		month: 'short',
		timeZone: 'UTC',
		year: 'numeric'
	}).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}
