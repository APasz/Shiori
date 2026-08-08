import { describe, expect, it } from 'vitest';
import { resolveTimingTimeZone, resolveTransportStopTimeZone } from './time-zone';

describe('itinerary time-zone resolution', () => {
	it('uses the trip zone unless a timing or transport stop overrides it', () => {
		const tripTimeZone = 'Asia/Tokyo';
		const timing = { kind: 'exact' as const, startAt: 1_775_952_000_000 };
		const timingOverride = {
			kind: 'exact' as const,
			startAt: 1_775_952_000_000,
			timeZone: 'Australia/Melbourne'
		};

		expect(resolveTimingTimeZone(timing, tripTimeZone)).toBe('Asia/Tokyo');
		expect(resolveTimingTimeZone(timingOverride, tripTimeZone)).toBe('Australia/Melbourne');
		expect(
			resolveTransportStopTimeZone(
				{ locationId: 'arrival', scheduledAt: 1_775_956_000_000 },
				'Australia/Melbourne'
			)
		).toBe('Australia/Melbourne');
		expect(
			resolveTransportStopTimeZone(
				{
					locationId: 'arrival',
					scheduledAt: 1_775_956_000_000,
					timeZone: 'Asia/Tokyo'
				},
				'Australia/Melbourne'
			)
		).toBe('Asia/Tokyo');
	});
});
