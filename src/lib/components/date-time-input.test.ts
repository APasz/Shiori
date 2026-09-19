import { describe, expect, it } from 'vitest';
import { zonedDateTimeToUnixMilliseconds } from '$lib/itinerary/zoned-time';
import { defaultDateForTimeOnlyValue, timeZoneReferenceTimestamp } from './date-time-input';

describe('defaultDateForTimeOnlyValue', () => {
	it('uses the supplied date when a time is entered without a date', () => {
		expect(defaultDateForTimeOnlyValue('T18:30', '2026-11-01')).toBe('2026-11-01T18:30');
	});

	it('does not replace a date already chosen for the value', () => {
		expect(defaultDateForTimeOnlyValue('2026-11-02T18:30', '2026-11-01')).toBe('2026-11-02T18:30');
	});

	it('leaves incomplete values unchanged', () => {
		expect(defaultDateForTimeOnlyValue('T', '2026-11-01')).toBe('T');
		expect(defaultDateForTimeOnlyValue('T18:30', 'not-a-date')).toBe('T18:30');
	});
});

describe('timeZoneReferenceTimestamp', () => {
	it('uses midday on a complete date when its time is incomplete', () => {
		const expected = zonedDateTimeToUnixMilliseconds('2026-10-29T12:00', 'Australia/Melbourne');
		if (expected === null) {
			throw new Error('Expected the reference date to resolve in Australia/Melbourne.');
		}

		expect(timeZoneReferenceTimestamp('2026-10-29T', 'Australia/Melbourne', 1)).toBe(expected);
	});

	it('uses its fallback when there is no complete date', () => {
		expect(timeZoneReferenceTimestamp('T10:00', 'Australia/Melbourne', 123)).toBe(123);
	});
});
