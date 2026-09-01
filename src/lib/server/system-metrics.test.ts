import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	memoryUsageFromProcFile,
	networkPeakHistoryBucketMilliseconds,
	networkCountersFromProcFile,
	networkPeakHistoryMilliseconds,
	SystemMetricsMonitor,
	type CpuCounters,
	type NetworkCounters,
	type NetworkPeakBucket,
	type NetworkPeakHistoryStore,
	type SystemMetricsSource
} from './system-metrics';

const kibibyte = 1_024;
const mebibyte = kibibyte * kibibyte;
const baseTime = Date.UTC(2026, 8, 1, 12, 0, 0);

function copiedHistory(history: readonly NetworkPeakBucket[]): NetworkPeakBucket[] {
	return history.map((bucket) => ({ ...bucket, peak: { ...bucket.peak } }));
}

describe('system metrics', () => {
	let monitor: SystemMetricsMonitor | undefined;

	afterEach(async () => {
		await monitor?.stop();
		monitor = undefined;
	});

	it('parses host memory and non-loopback network counters from Linux proc files', () => {
		expect(memoryUsageFromProcFile('MemTotal:       8192 kB\nMemAvailable:   2048 kB\n')).toEqual({
			totalBytes: 8_192 * kibibyte,
			usedBytes: 6_144 * kibibyte
		});
		expect(
			networkCountersFromProcFile(
				'Inter-|   Receive                                                |  Transmit\n' +
					' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
					'    lo: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0\n' +
					'  eth0: 300 0 0 0 0 0 0 0 400 0 0 0 0 0 0 0\n' +
					' wlan0: 500 0 0 0 0 0 0 0 600 0 0 0 0 0 0 0\n'
			)
		).toEqual({ receivedBytes: 800, sentBytes: 1_000 });
		expect(networkCountersFromProcFile('eth0: 300\n')).toBeNull();
	});

	it('reports one-second CPU and network rates while retaining the highest rate in the hour bucket', async () => {
		let now = baseTime;
		let cpu: CpuCounters = { idleMilliseconds: 500, totalMilliseconds: 1_000 };
		let network: NetworkCounters = { receivedBytes: 1_000, sentBytes: 2_000 };
		const savedHistory: NetworkPeakBucket[][] = [];
		const source: SystemMetricsSource = {
			cpuCounters: () => cpu,
			memoryUsage: () => ({ totalBytes: 512 * mebibyte, usedBytes: 128 * mebibyte }),
			networkCounters: () => network,
			now: () => now
		};
		const historyStore: NetworkPeakHistoryStore = {
			load: async () => [],
			save: async (history) => {
				savedHistory.push(copiedHistory(history));
			}
		};
		monitor = new SystemMetricsMonitor(source, historyStore);

		await monitor.start();
		expect(monitor.snapshot()).toMatchObject({
			cpuUsagePercent: null,
			memory: { totalBytes: 512 * mebibyte, usedBytes: 128 * mebibyte },
			network: null,
			networkPeak48Hours: null,
			sampledAt: baseTime
		});

		now += 1_000;
		cpu = { idleMilliseconds: 550, totalMilliseconds: 1_100 };
		network = { receivedBytes: 1_500, sentBytes: 2_250 };
		await monitor.sample();

		expect(monitor.snapshot()).toMatchObject({
			cpuUsagePercent: 50,
			network: { receivedBytesPerSecond: 500, sentBytesPerSecond: 250 },
			networkPeak48Hours: {
				observedAt: now,
				receivedBytesPerSecond: 500,
				sentBytesPerSecond: 250
			}
		});
		expect(savedHistory).toEqual([
			[
				{
					peak: { observedAt: now, receivedBytesPerSecond: 500, sentBytesPerSecond: 250 },
					startedAt: baseTime
				}
			]
		]);

		now += 1_000;
		cpu = { idleMilliseconds: 600, totalMilliseconds: 1_200 };
		network = { receivedBytes: 1_600, sentBytes: 2_650 };
		await monitor.sample();

		expect(monitor.snapshot()).toMatchObject({
			network: { receivedBytesPerSecond: 100, sentBytesPerSecond: 400 },
			networkPeak48Hours: {
				receivedBytesPerSecond: 500,
				sentBytesPerSecond: 250
			}
		});
		expect(savedHistory).toHaveLength(1);
	});

	it('persists the final peak from an hour when the following hour begins', async () => {
		let now = baseTime + networkPeakHistoryBucketMilliseconds - 3_000;
		let cpu: CpuCounters = { idleMilliseconds: 100, totalMilliseconds: 200 };
		let network: NetworkCounters = { receivedBytes: 100, sentBytes: 100 };
		const savedHistory: NetworkPeakBucket[][] = [];
		const source: SystemMetricsSource = {
			cpuCounters: () => cpu,
			memoryUsage: () => null,
			networkCounters: () => network,
			now: () => now
		};
		const historyStore: NetworkPeakHistoryStore = {
			load: async () => [],
			save: async (history) => {
				savedHistory.push(copiedHistory(history));
			}
		};
		monitor = new SystemMetricsMonitor(source, historyStore);

		await monitor.start();
		now += 1_000;
		cpu = { idleMilliseconds: 150, totalMilliseconds: 300 };
		network = { receivedBytes: 200, sentBytes: 200 };
		await monitor.sample();

		now += 1_000;
		cpu = { idleMilliseconds: 200, totalMilliseconds: 400 };
		network = { receivedBytes: 1_200, sentBytes: 300 };
		await monitor.sample();
		expect(savedHistory).toHaveLength(1);

		now += 1_000;
		cpu = { idleMilliseconds: 250, totalMilliseconds: 500 };
		network = { receivedBytes: 1_300, sentBytes: 400 };
		await monitor.sample();

		expect(savedHistory).toHaveLength(2);
		expect(savedHistory[1]).toEqual(
			expect.arrayContaining([
				{
					peak: {
						observedAt: baseTime + networkPeakHistoryBucketMilliseconds - 1_000,
						receivedBytesPerSecond: 1_000,
						sentBytesPerSecond: 100
					},
					startedAt: baseTime
				}
			])
		);
	});

	it('drops history outside the rolling 48-hour window during startup', async () => {
		const firstIncludedBucket = baseTime - networkPeakHistoryMilliseconds;
		const retainedBucket: NetworkPeakBucket = {
			peak: { observedAt: firstIncludedBucket + 1_000, receivedBytesPerSecond: 40, sentBytesPerSecond: 20 },
			startedAt: firstIncludedBucket
		};
		const expiredBucket: NetworkPeakBucket = {
			peak: {
				observedAt: firstIncludedBucket - networkPeakHistoryBucketMilliseconds + 1_000,
				receivedBytesPerSecond: 400,
				sentBytesPerSecond: 200
			},
			startedAt: firstIncludedBucket - networkPeakHistoryBucketMilliseconds
		};
		const futureCurrentBucket: NetworkPeakBucket = {
			peak: { observedAt: baseTime + 1_000, receivedBytesPerSecond: 600, sentBytesPerSecond: 300 },
			startedAt: baseTime
		};
		const futureBucket: NetworkPeakBucket = {
			peak: {
				observedAt: baseTime + networkPeakHistoryBucketMilliseconds + 1_000,
				receivedBytesPerSecond: 800,
				sentBytesPerSecond: 400
			},
			startedAt: baseTime + networkPeakHistoryBucketMilliseconds
		};
		const savedHistory: NetworkPeakBucket[][] = [];
		const source: SystemMetricsSource = {
			cpuCounters: () => ({ idleMilliseconds: 10, totalMilliseconds: 20 }),
			memoryUsage: () => null,
			networkCounters: () => ({ receivedBytes: 10, sentBytes: 10 }),
			now: () => baseTime
		};
		const historyStore: NetworkPeakHistoryStore = {
			load: async () => [expiredBucket, retainedBucket, futureCurrentBucket, futureBucket],
			save: async (history) => {
				savedHistory.push(copiedHistory(history));
			}
		};
		monitor = new SystemMetricsMonitor(source, historyStore);

		await monitor.start();

		expect(monitor.snapshot().networkPeak48Hours).toEqual(retainedBucket.peak);
		expect(savedHistory).toEqual([[retainedBucket]]);
	});

	it('does not present delayed samples as one-second measurements', async () => {
		let now = baseTime;
		let cpu: CpuCounters = { idleMilliseconds: 100, totalMilliseconds: 200 };
		let network: NetworkCounters = { receivedBytes: 100, sentBytes: 100 };
		const source: SystemMetricsSource = {
			cpuCounters: () => cpu,
			memoryUsage: () => null,
			networkCounters: () => network,
			now: () => now
		};
		const historyStore: NetworkPeakHistoryStore = { load: async () => [], save: async () => undefined };
		monitor = new SystemMetricsMonitor(source, historyStore);

		await monitor.start();
		now += 3_000;
		cpu = { idleMilliseconds: 200, totalMilliseconds: 400 };
		network = { receivedBytes: 1_100, sentBytes: 1_100 };
		await monitor.sample();

		expect(monitor.snapshot()).toMatchObject({ cpuUsagePercent: null, network: null, networkPeak48Hours: null });

		now += 1_000;
		cpu = { idleMilliseconds: 250, totalMilliseconds: 500 };
		network = { receivedBytes: 1_600, sentBytes: 1_300 };
		await monitor.sample();

		expect(monitor.snapshot()).toMatchObject({
			cpuUsagePercent: 50,
			network: { receivedBytesPerSecond: 500, sentBytesPerSecond: 200 }
		});
	});

	it('continues reporting live metrics when durable peak history cannot be saved', async () => {
		let now = baseTime;
		let cpu: CpuCounters = { idleMilliseconds: 100, totalMilliseconds: 200 };
		let network: NetworkCounters = { receivedBytes: 100, sentBytes: 100 };
		const persistenceFailure = new Error('storage is unavailable');
		const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const source: SystemMetricsSource = {
			cpuCounters: () => cpu,
			memoryUsage: () => null,
			networkCounters: () => network,
			now: () => now
		};
		const historyStore: NetworkPeakHistoryStore = {
			load: async () => [],
			save: async () => {
				throw persistenceFailure;
			}
		};
		monitor = new SystemMetricsMonitor(source, historyStore);

		try {
			await expect(monitor.start()).resolves.toBeUndefined();
			now += 1_000;
			cpu = { idleMilliseconds: 150, totalMilliseconds: 300 };
			network = { receivedBytes: 600, sentBytes: 400 };
			await expect(monitor.sample()).resolves.toBeUndefined();

			expect(monitor.snapshot().network).toEqual({ receivedBytesPerSecond: 500, sentBytesPerSecond: 300 });
			expect(report).toHaveBeenCalledWith(
				'Shiori system metrics history could not be saved. It will be retried.',
				persistenceFailure
			);
		} finally {
			await monitor.stop();
			monitor = undefined;
			report.mockRestore();
		}
	});
});
