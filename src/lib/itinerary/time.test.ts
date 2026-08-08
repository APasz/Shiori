import { describe, expect, it } from 'vitest';
import { itinerarySchema, unixTimestampSchema } from './schema';
import { formatLocalTimestamp, formatTimestampInTimeZone, localDateTimeToUnixMilliseconds } from './time';

describe('itinerary timestamps', () => {
	it('converts browser-local editor input to a canonical Unix-millisecond timestamp', () => {
		const timestamp = localDateTimeToUnixMilliseconds('2026-04-12T09:00');

		expect(timestamp).toBe(new Date(2026, 3, 12, 9, 0).getTime());
		expect(formatLocalTimestamp(timestamp ?? Number.NaN)).toEqual({
			date: '2026-04-12',
			time: '09:00'
		});
	});

	it('rejects invalid local datetimes and non-integer timestamps', () => {
		expect(localDateTimeToUnixMilliseconds('2026-02-30T09:00')).toBe(null);
		expect(unixTimestampSchema.safeParse(1775952000000).success).toBe(true);
		expect(unixTimestampSchema.safeParse(1775952000000.5).success).toBe(false);
	});

	it('formats the same timestamp in an explicit viewer time zone', () => {
		expect(formatTimestampInTimeZone(1775952000000, 'Asia/Tokyo')).toEqual({
			date: '2026-04-12',
			time: '09:00'
		});
		expect(formatTimestampInTimeZone(1775952000000, 'Australia/Melbourne')).toEqual({
			date: '2026-04-12',
			time: '10:00'
		});
	});

	it('requires a trip time zone and accepts an optional timing override', () => {
		expect(
			itinerarySchema.safeParse({
				title: 'Zoned trip',
				timeZone: 'Asia/Tokyo',
				items: [
					{
						id: 'arrival',
						title: 'Arrive',
						type: 'activity',
						timing: {
							kind: 'exact',
							startAt: 1_775_952_000_000,
							timeZone: 'Australia/Melbourne'
						}
					}
				]
			}).success
		).toBe(true);
		expect(itinerarySchema.safeParse({ title: 'Missing zone', items: [] }).success).toBe(false);
	});
});
