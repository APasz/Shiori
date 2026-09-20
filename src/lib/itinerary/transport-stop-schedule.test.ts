import { describe, expect, it } from 'vitest';
import { resolveTransportPlanStartForEditor } from './transport-stop-schedule';

describe('transport Plan editor start', () => {
	it('uses first-stop service time only to fill a blank exact Plan input', () => {
		const firstStopSchedule = { scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' };

		expect(resolveTransportPlanStartForEditor(undefined, firstStopSchedule)).toEqual({
			at: firstStopSchedule.scheduledAt,
			timeZone: firstStopSchedule.timeZone
		});
		expect(
			resolveTransportPlanStartForEditor({ at: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' }, firstStopSchedule)
		).toEqual({ at: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' });
	});
});
