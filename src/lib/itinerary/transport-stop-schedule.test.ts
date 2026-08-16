import { describe, expect, it } from 'vitest';
import { resolveTransportScheduleStart, resolveTransportStopSchedule } from './transport-stop-schedule';

describe('transport stop schedule resolution', () => {
	it('uses the first stop for the journey schedule only when its own time is absent', () => {
		const firstStopSchedule = { scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' };

		expect(resolveTransportScheduleStart(undefined, firstStopSchedule)).toEqual(firstStopSchedule);
		expect(
			resolveTransportScheduleStart(
				{ scheduledAt: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' },
				firstStopSchedule
			)
		).toEqual({ scheduledAt: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' });
	});

	it('uses the item schedule for an untimed first stop', () => {
		expect(
			resolveTransportStopSchedule(
				{ kind: 'exact', startAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' },
				{ locationId: 'departure' },
				0,
				'Australia/Melbourne'
			)
		).toEqual({ scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' });
	});

	it('keeps an explicit first-stop time separate from the item schedule', () => {
		expect(
			resolveTransportStopSchedule(
				{ kind: 'exact', startAt: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' },
				{ locationId: 'departure', scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Seoul' },
				0,
				'Australia/Melbourne'
			)
		).toEqual({ scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Seoul' });
	});

	it('does not infer a time for later untimed stops', () => {
		expect(
			resolveTransportStopSchedule(
				{ kind: 'exact', startAt: Date.UTC(2026, 9, 27, 10) },
				{ locationId: 'arrival' },
				1,
				'Australia/Melbourne'
			)
		).toBeUndefined();
	});
});
