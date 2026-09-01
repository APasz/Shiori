import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dataDirectory = '';

beforeEach(async () => {
	dataDirectory = await mkdtemp(join(tmpdir(), 'shiori-system-metrics-test-'));
	process.env.SHIORI_DATA_DIRECTORY = dataDirectory;
	vi.resetModules();
});

afterEach(async () => {
	delete process.env.SHIORI_DATA_DIRECTORY;
	await rm(dataDirectory, { force: true, recursive: true });
});

describe('system metrics persistence', () => {
	it('restores the rolling network peak after a monitor restart', async () => {
		const { SystemMetricsMonitor } = await import('./system-metrics');
		const startedAt = Date.UTC(2026, 8, 1, 12, 0, 0);
		let now = startedAt;
		let cpu = { idleMilliseconds: 100, totalMilliseconds: 200 };
		let network = { receivedBytes: 1_000, sentBytes: 2_000 };
		const source = {
			cpuCounters: () => cpu,
			memoryUsage: () => null,
			networkCounters: () => network,
			now: () => now
		};
		const firstMonitor = new SystemMetricsMonitor(source);

		await firstMonitor.start();
		now += 1_000;
		cpu = { idleMilliseconds: 150, totalMilliseconds: 300 };
		network = { receivedBytes: 1_700, sentBytes: 2_300 };
		await firstMonitor.sample();
		await firstMonitor.stop();

		const persisted: {
			networkPeakBuckets: Array<{ peak: Record<string, number>; startedAt: number }>;
			version: number;
		} = JSON.parse(await readFile(join(dataDirectory, 'system-metrics.json'), 'utf8'));
		expect(persisted).toMatchObject({
			networkPeakBuckets: [
				{
					peak: { observedAt: now, receivedBytesPerSecond: 700, sentBytesPerSecond: 300 },
					startedAt
				}
			],
			version: 2
		});

		const restartedMonitor = new SystemMetricsMonitor(source);
		await restartedMonitor.start();
		expect(restartedMonitor.snapshot().networkPeak48Hours).toEqual({
			observedAt: now,
			receivedBytesPerSecond: 700,
			sentBytesPerSecond: 300
		});
		await restartedMonitor.stop();
	});

	it('keeps the server metrics available when its derived history file is invalid', async () => {
		const historyPath = join(dataDirectory, 'system-metrics.json');
		await writeFile(historyPath, '{not valid JSON', 'utf8');
		const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { SystemMetricsMonitor } = await import('./system-metrics');
		const startedAt = Date.UTC(2026, 8, 1, 12, 0, 0);
		let now = startedAt;
		let cpu = { idleMilliseconds: 100, totalMilliseconds: 200 };
		let network = { receivedBytes: 100, sentBytes: 100 };
		const source = {
			cpuCounters: () => cpu,
			memoryUsage: () => null,
			networkCounters: () => network,
			now: () => now
		};
		const monitor = new SystemMetricsMonitor(source);

		try {
			await expect(monitor.start()).resolves.toBeUndefined();
			now += 1_000;
			cpu = { idleMilliseconds: 150, totalMilliseconds: 300 };
			network = { receivedBytes: 600, sentBytes: 400 };
			await monitor.sample();

			expect(monitor.snapshot().network).toEqual({ receivedBytesPerSecond: 500, sentBytesPerSecond: 300 });
			expect(report).toHaveBeenCalledWith(
				'Shiori system metrics history is invalid or unreadable. Starting with an empty history.',
				expect.any(SyntaxError)
			);
			expect(JSON.parse(await readFile(historyPath, 'utf8'))).toMatchObject({ version: 2 });
		} finally {
			await monitor.stop();
			report.mockRestore();
		}
	});
});
