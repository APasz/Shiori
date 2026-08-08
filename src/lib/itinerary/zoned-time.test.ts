import { describe, expect, it } from 'vitest';
import {
	formatTimestampForTimeZoneInput,
	isValidIanaTimeZone,
	zonedDateTimeToUnixMilliseconds
} from './zoned-time';

describe('editor time-zone conversion', () => {
	it('converts a selected-zone datetime to a canonical timestamp', () => {
		const timestamp = zonedDateTimeToUnixMilliseconds('2026-04-12T09:00', 'Asia/Tokyo');

		expect(timestamp).toBe(1775952000000);
		expect(formatTimestampForTimeZoneInput(timestamp ?? Number.NaN, 'Australia/Melbourne')).toBe(
			'2026-04-12T10:00'
		);
	});

	it('rejects invalid zones and local datetimes skipped by daylight saving', () => {
		expect(isValidIanaTimeZone('Asia/Tokyo')).toBe(true);
		expect(isValidIanaTimeZone('Mars/Olympus')).toBe(false);
		expect(zonedDateTimeToUnixMilliseconds('2026-10-04T02:30', 'Australia/Melbourne')).toBe(null);
	});
});
