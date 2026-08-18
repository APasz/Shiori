import { describe, expect, it } from 'vitest';
import {
	formatAccommodationTiming,
	formatAccommodationTimingForDay,
	formatAccommodationTimingForDayParts,
	formatAccommodationTimingParts,
	formatItineraryTimingBoundary,
	formatItineraryTiming,
	formatItineraryTimingForDay
} from './timing';

describe('daily itinerary timing', () => {
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

		expect(formatItineraryTiming(timing, true, 'Asia/Tokyo')).toBe('29 Oct 2026 – 01 Nov 2026 · times unknown');
		expect(formatItineraryTimingForDay(timing, '2026-10-29', 'Asia/Tokyo')).toBe('Check-in time unknown');
		expect(formatItineraryTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBe('Stay continues');
		expect(formatItineraryTimingForDay(timing, '2026-11-01', 'Asia/Tokyo')).toBe('Check-out time unknown');
	});

	it('labels accommodation check-in and check-out boundaries', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 6, 0),
			endAt: Date.UTC(2026, 10, 1, 1, 0)
		};

		expect(formatAccommodationTiming(timing, true, 'Asia/Tokyo')).toBe(
			'From 29 Oct 2026, 15:00 · To 01 Nov 2026, 10:00'
		);
		expect(formatAccommodationTimingForDay(timing, '2026-10-29', 'Asia/Tokyo')).toBe('From 15:00');
		expect(formatAccommodationTimingForDay(timing, '2026-10-30', 'Asia/Tokyo')).toBe('Stay continues');
		expect(formatAccommodationTimingForDay(timing, '2026-11-01', 'Asia/Tokyo')).toBe('To 10:00');
		expect(formatAccommodationTimingParts(timing, true, 'Asia/Tokyo')).toEqual([
			{ label: 'From', value: '29 Oct 2026, 15:00' },
			{ label: 'To', value: '01 Nov 2026, 10:00' }
		]);
		expect(formatAccommodationTimingForDayParts(timing, '2026-11-01', 'Asia/Tokyo')).toEqual([
			{ label: 'To', value: '10:00' }
		]);
	});

	it('formats exact timing boundaries independently', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 29, 6, 0),
			endAt: Date.UTC(2026, 10, 1, 1, 0)
		};

		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo')).toBe('29 Oct 2026, 15:00');
		expect(formatItineraryTimingBoundary(timing, 'end', true, 'Asia/Tokyo')).toBe('01 Nov 2026, 10:00');
	});

	it('keeps date-only timing boundaries time-free', () => {
		const timing = {
			kind: 'exact' as const,
			startAt: Date.UTC(2026, 9, 28, 15),
			endAt: Date.UTC(2026, 10, 1, 14, 59),
			timePrecision: 'date' as const,
			timeZone: 'Asia/Tokyo'
		};

		expect(formatItineraryTimingBoundary(timing, 'start', true, 'Asia/Tokyo')).toBe('29 Oct 2026 · time unknown');
		expect(formatItineraryTimingBoundary(timing, 'end', true, 'Asia/Tokyo')).toBe('01 Nov 2026 · time unknown');
	});
});
