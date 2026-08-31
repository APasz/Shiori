import { describe, expect, it } from 'vitest';
import {
	formatAccommodationTiming,
	formatAccommodationTimingForDay,
	formatAccommodationTimingForDayParts,
	formatAccommodationTimingParts,
	formatItineraryTimingBoundary,
	formatItineraryTiming,
	formatItineraryTimingForDay,
	timingEarliestTimestamp,
	timingEndTimestamp,
	timingStartTimestamp
} from './timing';

describe('timing boundaries', () => {
	it('keeps an approximate timing anchor distinct from its earliest possible timestamp', () => {
		const timing = {
			kind: 'approximate' as const,
			nominalAt: Date.UTC(2026, 0, 1),
			toleranceMinutes: 60
		};

		expect(timingEarliestTimestamp(timing)).toBe(Date.UTC(2025, 11, 31, 23));
		expect(timingStartTimestamp(timing)).toBe(Date.UTC(2026, 0, 1));
		expect(timingEndTimestamp(timing)).toBe(Date.UTC(2026, 0, 1, 1));
	});
});

describe('daily itinerary timing', () => {
	it('applies date and time display preferences to timing labels', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 6, 0),
			endAt: Date.UTC(2026, 9, 29, 8, 30)
		};
		const formatPreferences = { dateFormat: 'day-month-year', timeFormat: 'twelve-hour' } as const;

		expect(formatItineraryTiming(timing, true, 'Asia/Tokyo', 'date', 'en-US', formatPreferences)).toBe(
			'3:00 pm–5:30 pm'
		);
		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo', 'date', 'en-US', formatPreferences)).toBe(
			'29-10-2026, 3:00 pm'
		);
		expect(formatItineraryTimingForDay(timing, '2026-10-29', 'Asia/Tokyo', 'Asia/Tokyo', formatPreferences)).toBe(
			'3:00 pm–5:30 pm'
		);
	});

	it('shows an overnight item start and end time only on their applicable days', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 8, 0),
			endAt: Date.UTC(2026, 9, 30, 4, 0)
		};

		expect(formatItineraryTimingForDay(timing, '2026-10-29', 'Asia/Tokyo')).toBe('17:00');
		expect(formatItineraryTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBe('13:00');
	});

	it('marks intermediate days of a multi-day item as continuing', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 8, 0),
			endAt: Date.UTC(2026, 10, 1, 4, 0)
		};

		expect(formatItineraryTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBe('Continues');
	});

	it('uses the viewer day to select a local-time boundary', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 3, 11, 15, 30),
			endAt: Date.UTC(2026, 3, 12, 14, 30)
		};

		expect(formatItineraryTimingForDay(timing, '2026-04-12', 'Asia/Tokyo', 'America/Los_Angeles')).toBe('23:30');
	});

	it('describes date-only stays without inventing a local time', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 28, 15),
			endAt: Date.UTC(2026, 10, 1, 14, 59),
			timePrecision: 'date' as const,
			timeZone: 'Asia/Tokyo'
		};

		expect(formatItineraryTiming(timing, true, 'Asia/Tokyo')).toBe('2026-10-29 – 2026-11-01 · Unknown');
		expect(formatItineraryTimingForDay(timing, '2026-10-29', 'Asia/Tokyo')).toBe('Check-in Unknown');
		expect(formatItineraryTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBe('Stay continues');
		expect(formatItineraryTimingForDay(timing, '2026-11-01', 'Asia/Tokyo')).toBe('Check-out Unknown');
		expect(formatAccommodationTimingForDay(timing, '2026-10-29', 'Asia/Tokyo')).toBe('Check-in Unknown');
		expect(formatAccommodationTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBeNull();
		expect(formatAccommodationTimingForDay(timing, '2026-11-01', 'Asia/Tokyo')).toBe('Check-out Unknown');
	});

	it('labels accommodation check-in and check-out boundaries', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 6, 0),
			endAt: Date.UTC(2026, 10, 1, 1, 0)
		};

		expect(formatAccommodationTiming(timing, true, 'Asia/Tokyo')).toBe(
			'Check-in 2026-10-29, 15:00 · Check-out 2026-11-01, 10:00'
		);
		expect(formatAccommodationTimingForDay(timing, '2026-10-29', 'Asia/Tokyo')).toBe('Check-in 15:00');
		expect(formatAccommodationTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBeNull();
		expect(formatAccommodationTimingForDay(timing, '2026-11-01', 'Asia/Tokyo')).toBe('Check-out 10:00');
		expect(formatAccommodationTimingParts(timing, true, 'Asia/Tokyo')).toEqual([
			{ label: 'Check-in', value: '2026-10-29, 15:00' },
			{ label: 'Check-out', value: '2026-11-01, 10:00' }
		]);
		expect(formatAccommodationTimingForDayParts(timing, '2026-11-01', 'Asia/Tokyo')).toEqual([
			{ label: 'Check-out', value: '10:00' }
		]);
		expect(formatAccommodationTimingForDayParts(timing, '2026-10-30', 'Asia/Tokyo')).toBeNull();
	});

	it('formats exact timing boundaries independently', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 6, 0),
			endAt: Date.UTC(2026, 10, 1, 1, 0)
		};

		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo')).toBe('2026-10-29, 15:00');
		expect(formatItineraryTimingBoundary(timing, 'end', true, 'Asia/Tokyo')).toBe('2026-11-01, 10:00');
		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo', 'date-with-weekday')).toBe(
			'2026-10-29, 15:00'
		);
		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo', 'date-with-weekday', 'en-US')).toBe(
			'Thu, Oct 29, 2026, 15:00'
		);
	});

	it('keeps date-only timing boundaries time-free', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 28, 15),
			endAt: Date.UTC(2026, 10, 1, 14, 59),
			timePrecision: 'date' as const,
			timeZone: 'Asia/Tokyo'
		};

		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo')).toBe('2026-10-29 · Unknown');
		expect(formatItineraryTimingBoundary(timing, 'end', true, 'Asia/Tokyo')).toBe('2026-11-01 · Unknown');
	});
});
