import { describe, expect, it } from 'vitest';
import {
	addCalendarDays,
	addCalendarMonths,
	calendarDays,
	calendarMonthForDate,
	formatCalendarDate
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

	it('moves across a year boundary and formats valid selections', () => {
		expect(addCalendarMonths({ month: 12, year: 2026 }, 1)).toEqual({ month: 1, year: 2027 });
		expect(formatCalendarDate('2026-12-04')).toBe('04 Dec 2026');
		expect(formatCalendarDate('2026-02-29')).toBeNull();
	});
});
