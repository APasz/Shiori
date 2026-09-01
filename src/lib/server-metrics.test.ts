import { describe, expect, it } from 'vitest';
import { serverMetricsSchema } from './server-metrics';

describe('server metrics schema', () => {
	it('accepts only whole-byte traffic rates', () => {
		const metrics = {
			cpuUsagePercent: null,
			memory: null,
			network: { receivedBytesPerSecond: 1.5, sentBytesPerSecond: 2 },
			networkPeak48Hours: null,
			sampledAt: 0
		};

		expect(serverMetricsSchema.safeParse(metrics).success).toBe(false);
	});
});
