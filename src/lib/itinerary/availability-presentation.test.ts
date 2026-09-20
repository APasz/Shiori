import { describe, expect, it } from 'vitest';
import {
	availabilityConstraintLabel,
	availabilityConstraintPresentation,
	formatAvailabilityConstraintTiming
} from './availability-presentation';

const twelveHourDayMonthYear = {
	formatPreferences: { dateFormat: 'day-month-year' as const, timeFormat: 'twelve-hour' as const }
};

describe('availability presentation', () => {
	it('uses concise semantic labels unless a custom label is supplied', () => {
		expect(availabilityConstraintLabel({ type: 'reception-hours' })).toBe('Reception');
		expect(availabilityConstraintLabel({ type: 'check-in' })).toBe('Check-in');
		expect(availabilityConstraintLabel({ type: 'check-out' })).toBe('Check-out');
		expect(availabilityConstraintLabel({ label: 'Luggage desk', type: 'storage-hours' })).toBe('Luggage desk');
	});

	it('formats period labels in their saved zone without repeating the item date', () => {
		const presentation = availabilityConstraintPresentation(
			{
				timing: {
					endAt: Date.UTC(2026, 3, 12, 7),
					kind: 'period',
					startAt: Date.UTC(2026, 3, 12, 1),
					timeZone: 'Asia/Tokyo'
				},
				type: 'opening-hours'
			},
			{
				...twelveHourDayMonthYear,
				contextTimeZone: 'Asia/Tokyo',
				contextTimestamps: [Date.UTC(2026, 3, 12, 0)]
			}
		);

		expect(presentation).toMatchObject({ label: 'Opening', timeZone: 'Asia/Tokyo', timing: '10:00 am–4:00 pm' });
	});

	it('includes a date for a different local day and formats Until times in their stored zone', () => {
		const timing = {
			at: Date.UTC(2026, 3, 12, 22, 30),
			kind: 'until' as const,
			timeZone: 'America/Los_Angeles'
		};

		expect(
			availabilityConstraintPresentation(
				{ timing, type: 'last-admission' },
				{
					...twelveHourDayMonthYear,
					contextTimeZone: 'Asia/Tokyo',
					contextTimestamps: [Date.UTC(2026, 3, 12, 0)]
				}
			)
		).toMatchObject({
			label: 'Last admission',
			timeZone: 'America/Los_Angeles',
			timing: 'Until 12-04-2026, 3:30 pm'
		});
	});

	it('prefixes one-sided property rules with their truthful semantics', () => {
		expect(
			availabilityConstraintPresentation(
				{
					timing: { at: Date.UTC(2026, 3, 12, 6), kind: 'from', timeZone: 'Asia/Tokyo' },
					type: 'check-in'
				},
				{ contextTimeZone: 'Asia/Tokyo', contextTimestamps: [Date.UTC(2026, 3, 12)] }
			)
		).toMatchObject({ label: 'Check-in', timing: 'From 15:00' });
		expect(
			availabilityConstraintPresentation(
				{
					timing: { at: Date.UTC(2026, 3, 12, 1), kind: 'until', timeZone: 'Asia/Tokyo' },
					type: 'check-out'
				},
				{ contextTimeZone: 'Asia/Tokyo', contextTimestamps: [Date.UTC(2026, 3, 12)] }
			)
		).toMatchObject({ label: 'Check-out', timing: 'Until 10:00' });
	});

	it('keeps multiple periods as separate split-hour entries', () => {
		const options = { contextTimeZone: 'Asia/Tokyo', contextTimestamps: [Date.UTC(2026, 3, 12, 0)] };
		const morning = formatAvailabilityConstraintTiming(
			{
				endAt: Date.UTC(2026, 3, 12, 3),
				kind: 'period',
				startAt: Date.UTC(2026, 3, 12, 1),
				timeZone: 'Asia/Tokyo'
			},
			options
		);
		const afternoon = formatAvailabilityConstraintTiming(
			{
				endAt: Date.UTC(2026, 3, 12, 7),
				kind: 'period',
				startAt: Date.UTC(2026, 3, 12, 4),
				timeZone: 'Asia/Tokyo'
			},
			options
		);

		expect([morning, afternoon]).toEqual(['10:00–12:00', '13:00–16:00']);
	});

	it('retains a date when a differently zoned entry would otherwise inherit the wrong item date', () => {
		expect(
			formatAvailabilityConstraintTiming(
				{
					at: Date.UTC(2026, 3, 12, 1),
					kind: 'until',
					timeZone: 'America/Los_Angeles'
				},
				{
					...twelveHourDayMonthYear,
					contextTimeZone: 'Asia/Tokyo',
					contextTimestamps: [Date.UTC(2026, 3, 12, 0)]
				}
			)
		).toBe('Until 11-04-2026, 6:00 pm');
	});
});
