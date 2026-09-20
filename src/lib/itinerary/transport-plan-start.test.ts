import { describe, expect, it } from 'vitest';
import { resolveTransportPlanStartForEditor } from './transport-plan-start';
import type { TransportServiceTime } from './transport-service-timing';

describe('transport Plan editor start', () => {
	it('uses the first scheduled service time only to fill a blank exact Plan input', () => {
		const firstServiceTime: TransportServiceTime = {
			at: Date.UTC(2026, 9, 27, 10),
			locationId: 'departure',
			role: 'departure',
			source: 'service',
			timeZone: 'Asia/Tokyo'
		};

		expect(resolveTransportPlanStartForEditor(undefined, firstServiceTime)).toEqual({
			at: firstServiceTime.at,
			timeZone: firstServiceTime.timeZone
		});
		expect(
			resolveTransportPlanStartForEditor({ at: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' }, firstServiceTime)
		).toEqual({ at: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' });
	});
});
