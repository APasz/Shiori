import { describe, expect, it } from 'vitest';
import {
	clampLocalDateTimeToUnixEpoch,
	formatTimestampForTimeZoneInput,
	isCompleteLocalDateTime,
	isValidIanaTimeZone,
	zonedDateTimeToUnixMilliseconds
} from './zoned-time';

describe('editor time-zone conversion', () => {
	it('clamps local datetimes before the Unix epoch', () => {
		expect(clampLocalDateTimeToUnixEpoch('1970-01-01T00:00', 'Asia/Tokyo')).toBe('1970-01-01T09:00');
		expect(clampLocalDateTimeToUnixEpoch('1970-01-01T09:00', 'Asia/Tokyo')).toBe('1970-01-01T09:00');
		expect(clampLocalDateTimeToUnixEpoch('not-a-datetime', 'Asia/Tokyo')).toBe('not-a-datetime');
	});

	it('converts a selected-zone datetime to a canonical timestamp', () => {
		const timestamp = zonedDateTimeToUnixMilliseconds('2026-04-12T09:00', 'Asia/Tokyo');

		expect(timestamp).toBe(1775952000000);
		expect(formatTimestampForTimeZoneInput(timestamp ?? Number.NaN, 'Australia/Melbourne')).toBe('2026-04-12T10:00');
	});

	it('rejects invalid zones and local datetimes skipped by daylight saving', () => {
		expect(isValidIanaTimeZone('Asia/Tokyo')).toBe(true);
		expect(isValidIanaTimeZone('Mars/Olympus')).toBe(false);
		expect(zonedDateTimeToUnixMilliseconds('2026-10-04T02:30', 'Australia/Melbourne')).toBe(null);
	});

	it('returns null for timestamps outside the Date range', () => {
		expect(formatTimestampForTimeZoneInput(Number.MAX_SAFE_INTEGER, 'UTC')).toBe(null);
	});

	it('distinguishes a date-only placeholder from a complete local datetime', () => {
		expect(isCompleteLocalDateTime('2026-10-28T')).toBe(false);
		expect(isCompleteLocalDateTime('2026-10-28T11:13')).toBe(true);
	});
});
