import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { CalendarDate } from '@internationalized/date';
import DateTimeInput from './DateTimeInput.svelte';
import { adjustCalendarDate, minimumCalendarDate, parseCalendarDate, type DayAdjustment } from './date-picker';

function requireCalendarDate(value: string): CalendarDate {
	const date = parseCalendarDate(value);
	if (!date) {
		throw new Error(`Expected ${value} to be a complete calendar date.`);
	}
	return date;
}

function requireAdjustedCalendarDate(date: CalendarDate, adjustment: DayAdjustment): CalendarDate {
	const adjustedDate = adjustCalendarDate(date, adjustment);
	if (!adjustedDate) {
		throw new Error('Expected the adjusted date to stay within the supported ISO year range.');
	}
	return adjustedDate;
}

describe('date-picker helpers', () => {
	it('uses the Unix epoch as its minimum calendar date', () => {
		expect(minimumCalendarDate).toBe('1970-01-01');
	});

	it('parses complete ISO calendar dates only', () => {
		expect(parseCalendarDate('2026-10-25')?.toString()).toBe('2026-10-25');
		expect(parseCalendarDate('25/10/2026')).toBeUndefined();
		expect(parseCalendarDate('2026-02-29')).toBeUndefined();
		expect(parseCalendarDate('0000-01-01')).toBeUndefined();
	});

	it('shifts a calendar date by one day across month boundaries', () => {
		const date = requireCalendarDate('2026-03-01');

		expect(requireAdjustedCalendarDate(date, -1).toString()).toBe('2026-02-28');
		expect(requireAdjustedCalendarDate(date, 1).toString()).toBe('2026-03-02');
		expect(requireAdjustedCalendarDate(requireCalendarDate('2024-02-28'), 1).toString()).toBe('2024-02-29');
		expect(requireAdjustedCalendarDate(requireCalendarDate('2027-01-01'), -1).toString()).toBe('2026-12-31');
	});

	it('does not move outside the supported ISO year range', () => {
		expect(adjustCalendarDate(requireCalendarDate('0001-01-01'), -1)).toBeUndefined();
		expect(adjustCalendarDate(requireCalendarDate('9999-12-31'), 1)).toBeUndefined();
	});
});

describe('DateTimeInput date controls', () => {
	it('renders day controls and a calendar trigger for date selection', () => {
		const html = render(DateTimeInput, {
			props: {
				dateTime: '2026-10-25T23:00',
				id: 'start-date',
				label: 'Start date and time',
				onDateTimeChange: () => {},
				pickerMode: 'date',
				showTimeZonePicker: false
			}
		}).body;

		expect(html).toContain('aria-label="Increase day"');
		expect(html).toContain('aria-label="Decrease day"');
		expect(html).toContain('aria-label="Open calendar for Start date and time"');
		expect(html).toMatch(/data-date-field-input[\s\S]*data-segment="trigger"/);
	});

	it('disables unavailable day controls', () => {
		const html = render(DateTimeInput, {
			props: {
				dateTime: '2026-10-25T23:00',
				id: 'start-date',
				label: 'Start date and time',
				minimumDate: '2026-10-25',
				onDateTimeChange: () => {},
				pickerMode: 'date',
				showTimeZonePicker: false
			}
		}).body;

		expect(html).toMatch(/aria-label="Decrease day" disabled/);
	});

	it('disables decrementing at the Unix epoch by default', () => {
		const html = render(DateTimeInput, {
			props: {
				dateTime: '1970-01-01T00:00',
				id: 'start-date',
				label: 'Start date and time',
				onDateTimeChange: () => {},
				pickerMode: 'date',
				showTimeZonePicker: false
			}
		}).body;

		expect(html).toMatch(/aria-label="Decrease day" disabled/);
	});

	it('disables day controls until a complete date is chosen', () => {
		const html = render(DateTimeInput, {
			props: {
				dateTime: '',
				id: 'start-date',
				label: 'Start date and time',
				onDateTimeChange: () => {},
				pickerMode: 'date',
				showTimeZonePicker: false
			}
		}).body;

		expect(html).toMatch(/aria-label="Increase day" disabled/);
		expect(html).toMatch(/aria-label="Decrease day" disabled/);
	});
});
