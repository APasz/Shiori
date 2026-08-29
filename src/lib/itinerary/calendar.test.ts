import { describe, expect, it } from 'vitest';
import {
	addCalendarDays,
	addCalendarMonths,
	calendarDays,
	calendarMonthForDate,
	datePickerDateSeparator,
	datePickerLocale,
	formatCalendarDate,
	formatCalendarDateTime,
	formatCalendarMonth,
	isAustralianEnglishLocale
} from './calendar';

describe('calendar helpers', () => {
	it('adds days across calendar month and year boundaries', () => {
		expect(addCalendarDays('2026-04-12', 1)).toBe('2026-04-13');
		expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addCalendarDays('not-a-date', 1)).toBe(null);
	});

	it('validates calendar dates before deriving a month', () => {
		expect(calendarMonthForDate('2026-12-04')).toEqual({ month: 12, year: 2026 });
		expect(calendarMonthForDate('2026-02-29')).toBeNull();
		expect(calendarMonthForDate('04/12/2026')).toBeNull();
	});

	it('generates a Monday-first six-week calendar grid', () => {
		const days = calendarDays({ month: 12, year: 2026 });

		expect(days).toHaveLength(42);
		expect(days[0]).toMatchObject({ date: '2026-11-30', inCurrentMonth: false });
		expect(days[4]).toMatchObject({ date: '2026-12-04', inCurrentMonth: true });
		expect(days.at(-1)).toMatchObject({ date: '2027-01-10', inCurrentMonth: false });
	});

	it('uses a supplied locale and otherwise falls back to ISO calendar dates', () => {
		expect(addCalendarMonths({ month: 12, year: 2026 }, 1)).toEqual({ month: 1, year: 2027 });
		expect(formatCalendarDate('2026-12-04')).toBe('2026-12-04');
		expect(formatCalendarDate('2026-12-04', 'date-with-weekday')).toBe('2026-12-04');
		expect(formatCalendarDate('2026-12-04', 'date', 'not a locale')).toBe('2026-12-04');
		expect(formatCalendarMonth({ month: 12, year: 2026 })).toBe('2026-12');
		expect(isAustralianEnglishLocale('en-AU')).toBe(true);
		expect(isAustralianEnglishLocale('en-AU-u-ca-gregory')).toBe(true);
		expect(isAustralianEnglishLocale('en-US')).toBe(false);
		expect(formatCalendarDate('2026-12-04', 'date', 'en-AU')).toBe('04-12-2026');
		expect(formatCalendarDate('2026-12-04', 'date-with-weekday', 'en-AU')).toBe('04-12-2026 (Fri)');
		expect(formatCalendarDateTime('2026-12-04', '10:30', 'date', 'en-AU')).toBe('04-12-2026, 10:30');
		expect(formatCalendarDate('2026-12-04', 'date', 'en-US')).toBe('Dec 4, 2026');
		expect(formatCalendarDate('2026-12-04', 'date-with-weekday', 'en-US')).toBe('Fri, Dec 4, 2026');
		expect(formatCalendarDateTime('2026-12-04', '10:30', 'date', 'en-US')).toBe('Dec 4, 2026, 10:30');
		expect(formatCalendarMonth({ month: 12, year: 2026 }, 'en-US')).toBe('December 2026');
		expect(formatCalendarDate('2026-02-29')).toBeNull();
	});

	it('applies fixed date-order preferences independently of the detected locale', () => {
		expect(formatCalendarDate('2026-12-04', 'date', 'en-US', 'day-month-year')).toBe('04-12-2026');
		expect(formatCalendarDate('2026-12-04', 'date', 'en-AU', 'month-day-year')).toBe('12-04-2026');
		expect(formatCalendarDate('2026-12-04', 'date-with-weekday', 'en-US', 'year-month-day')).toBe('2026-12-04 (Fri)');
		expect(formatCalendarDateTime('2026-12-04', '10:30', 'date', 'en-US', 'month-day-year', 'twelve-hour')).toBe(
			'12-04-2026, 10:30 am'
		);
		expect(datePickerLocale('en-US', 'day-month-year')).toBe('en-AU');
		expect(datePickerLocale('en-AU', 'year-month-day')).toContain('en-CA');
		expect(datePickerDateSeparator('en-US', 'locale')).toBeNull();
		expect(datePickerDateSeparator('en-AU', 'locale')).toBe('-');
		expect(datePickerDateSeparator('en-US', 'month-day-year')).toBe('-');
	});
});
