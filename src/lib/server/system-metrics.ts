import { readFile } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
	memoryUsageSchema,
	networkPeakSchema,
	type MemoryUsage,
	type NetworkPeak,
	type NetworkTraffic,
	type ServerMetrics
} from '$lib/server-metrics';
import { persistentDataDirectory, writeManagedJsonFile } from '$lib/server/persistent-files';
import { unixTimestampSchema } from '$lib/unix-timestamp-schema';

export const systemMetricsSampleIntervalMilliseconds = 1_000;
export const networkPeakHistoryMilliseconds = 48 * 60 * 60 * 1_000;
/** Hourly aggregation keeps the durable rolling peak compact and avoids high-frequency disk writes. */
export const networkPeakHistoryBucketMilliseconds = 60 * 60 * 1_000;

const maximumMetricsSampleGapMilliseconds = systemMetricsSampleIntervalMilliseconds * 2;
const maximumNetworkPeakBuckets = networkPeakHistoryMilliseconds / networkPeakHistoryBucketMilliseconds + 1;
const systemMetricsHistoryVersion = 2;
const systemMetricsHistoryPath = join(persistentDataDirectory, 'system-metrics.json');

export type CpuCounters = Readonly<{
	idleMilliseconds: number;
	totalMilliseconds: number;
}>;

export type NetworkCounters = Readonly<{
	receivedBytes: number;
	sentBytes: number;
}>;

type TimedSample = Readonly<{
	sampledAt: number;
}>;

type TimedCounters<Counters> = Counters & TimedSample;

type TimedCpuCounters = TimedCounters<CpuCounters>;
type TimedNetworkCounters = TimedCounters<NetworkCounters>;

export type NetworkPeakBucket = Readonly<{
	peak: NetworkPeak;
	startedAt: number;
}>;

export type SystemMetricsSource = Readonly<{
	cpuCounters: () => CpuCounters | null;
	memoryUsage: () => MemoryUsage | null | Promise<MemoryUsage | null>;
	networkCounters: () => NetworkCounters | null | Promise<NetworkCounters | null>;
	now: () => number;
}>;

export type NetworkPeakHistoryStore = Readonly<{
	load: () => Promise<readonly NetworkPeakBucket[]>;
	save: (history: readonly NetworkPeakBucket[]) => Promise<void>;
}>;

const networkPeakBucketSchema = z
	.strictObject({
		peak: networkPeakSchema,
		startedAt: unixTimestampSchema
	})
	.superRefine((bucket, context) => {
		if (bucket.startedAt % networkPeakHistoryBucketMilliseconds !== 0) {
			context.addIssue({
				code: 'custom',
				message: 'Network peak buckets must start on an hourly boundary.'
			});
		}
		if (
			bucket.peak.observedAt < bucket.startedAt ||
			bucket.peak.observedAt >= bucket.startedAt + networkPeakHistoryBucketMilliseconds
		) {
			context.addIssue({
				code: 'custom',
				message: 'A network peak must be observed within its hourly bucket.'
			});
		}
	});

const systemMetricsHistorySchema = z
	.strictObject({
		networkPeakBuckets: z.array(networkPeakBucketSchema).max(maximumNetworkPeakBuckets),
		version: z.literal(systemMetricsHistoryVersion)
	})
	.superRefine((history, context) => {
		let previousStartedAt = -1;
		for (const [index, bucket] of history.networkPeakBuckets.entries()) {
			if (bucket.startedAt <= previousStartedAt) {
				context.addIssue({
					code: 'custom',
					message: 'Network peak buckets must be in chronological order without duplicates.',
					path: ['networkPeakBuckets', index, 'startedAt']
				});
			}
			previousStartedAt = bucket.startedAt;
		}
	});

function isFileNotFound(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function loadNetworkPeakHistory(): Promise<readonly NetworkPeakBucket[]> {
	try {
		const file = JSON.parse(await readFile(systemMetricsHistoryPath, 'utf8'));
		return systemMetricsHistorySchema.parse(file).networkPeakBuckets;
	} catch (error: unknown) {
		if (isFileNotFound(error)) {
			return [];
		}
		console.error('Shiori system metrics history is invalid or unreadable. Starting with an empty history.', error);
		return [];
	}
}

const persistentNetworkPeakHistoryStore: NetworkPeakHistoryStore = {
	load: loadNetworkPeakHistory,
	save: async (history) => {
		await writeManagedJsonFile(systemMetricsHistoryPath, {
			networkPeakBuckets: history,
			version: systemMetricsHistoryVersion
		});
	}
};

function isSafeNonnegativeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function cpuCountersFromSystem(): CpuCounters | null {
	const availableCpus = cpus();
	if (availableCpus.length === 0) {
		return null;
	}

	let idleMilliseconds = 0;
	let totalMilliseconds = 0;
	for (const cpu of availableCpus) {
		const { idle, irq, nice, sys, user } = cpu.times;
		const total = idle + irq + nice + sys + user;
		if (!isSafeNonnegativeInteger(idle) || !isSafeNonnegativeInteger(total)) {
			return null;
		}
		idleMilliseconds += idle;
		totalMilliseconds += total;
	}

	return isSafeNonnegativeInteger(idleMilliseconds) && isSafeNonnegativeInteger(totalMilliseconds)
		? { idleMilliseconds, totalMilliseconds }
		: null;
}

function nonnegativeIntegerFromText(value: string | undefined): number | null {
	if (!value || !/^\d+$/.test(value)) {
		return null;
	}
	const parsed = Number(value);
	return isSafeNonnegativeInteger(parsed) ? parsed : null;
}

function memoryValueInBytes(value: string | undefined): number | null {
	const kibibytes = nonnegativeIntegerFromText(value);
	if (kibibytes === null) {
		return null;
	}
	const bytes = kibibytes * 1_024;
	return isSafeNonnegativeInteger(bytes) ? bytes : null;
}

/** Uses Linux's MemAvailable measurement so reclaimable memory is not reported as used. */
export function memoryUsageFromProcFile(file: string): MemoryUsage | null {
	const fields = new Map<string, string>();
	for (const line of file.split('\n')) {
		const match = /^(?<name>\w+):\s+(?<value>\d+)\s+kB$/.exec(line);
		if (match?.groups) {
			fields.set(match.groups.name, match.groups.value);
		}
	}

	const totalBytes = memoryValueInBytes(fields.get('MemTotal'));
	const availableBytes = memoryValueInBytes(fields.get('MemAvailable'));
	if (totalBytes === null || availableBytes === null || availableBytes > totalBytes) {
		return null;
	}
	return memoryUsageSchema.parse({ totalBytes, usedBytes: totalBytes - availableBytes });
}

function fallbackMemoryUsage(): MemoryUsage | null {
	const totalBytes = totalmem();
	const freeBytes = freemem();
	if (
		!isSafeNonnegativeInteger(totalBytes) ||
		!isSafeNonnegativeInteger(freeBytes) ||
		totalBytes === 0 ||
		freeBytes > totalBytes
	) {
		return null;
	}
	return { totalBytes, usedBytes: totalBytes - freeBytes };
}

async function memoryUsageFromSystem(): Promise<MemoryUsage | null> {
	try {
		const usage = memoryUsageFromProcFile(await readFile('/proc/meminfo', 'utf8'));
		return usage ?? fallbackMemoryUsage();
	} catch {
		return fallbackMemoryUsage();
	}
}

/** Totals Linux network-interface byte counters while excluding internal loopback traffic. */
export function networkCountersFromProcFile(file: string): NetworkCounters | null {
	let receivedBytes = 0;
	let sentBytes = 0;
	let hasNetworkInterface = false;

	for (const line of file.split('\n')) {
		const separatorIndex = line.indexOf(':');
		if (separatorIndex < 0) {
			continue;
		}
		const interfaceName = line.slice(0, separatorIndex).trim();
		if (!interfaceName || interfaceName === 'lo') {
			continue;
		}
		const counters = line
			.slice(separatorIndex + 1)
			.trim()
			.split(/\s+/);
		const received = nonnegativeIntegerFromText(counters[0]);
		const sent = nonnegativeIntegerFromText(counters[8]);
		if (received === null || sent === null) {
			return null;
		}
		receivedBytes += received;
		sentBytes += sent;
		if (!isSafeNonnegativeInteger(receivedBytes) || !isSafeNonnegativeInteger(sentBytes)) {
			return null;
		}
		hasNetworkInterface = true;
	}

	return hasNetworkInterface ? { receivedBytes, sentBytes } : null;
}

async function networkCountersFromSystem(): Promise<NetworkCounters | null> {
	try {
		return networkCountersFromProcFile(await readFile('/proc/net/dev', 'utf8'));
	} catch {
		return null;
	}
}

const defaultSystemMetricsSource: SystemMetricsSource = {
	cpuCounters: cpuCountersFromSystem,
	memoryUsage: memoryUsageFromSystem,
	networkCounters: networkCountersFromSystem,
	now: () => Date.now()
};

function emptyMetrics(): ServerMetrics {
	return {
		cpuUsagePercent: null,
		memory: null,
		network: null,
		networkPeak48Hours: null,
		sampledAt: null
	};
}

function bucketStartedAt(timestamp: number): number {
	return Math.floor(timestamp / networkPeakHistoryBucketMilliseconds) * networkPeakHistoryBucketMilliseconds;
}

function networkTrafficTotal(traffic: NetworkTraffic): bigint {
	return BigInt(traffic.receivedBytesPerSecond) + BigInt(traffic.sentBytesPerSecond);
}

function sampledIntervalMilliseconds(previous: TimedSample, current: TimedSample): number | null {
	const elapsedMilliseconds = current.sampledAt - previous.sampledAt;
	return elapsedMilliseconds > 0 && elapsedMilliseconds <= maximumMetricsSampleGapMilliseconds
		? elapsedMilliseconds
		: null;
}

function networkTrafficFromCounters(
	previous: TimedNetworkCounters,
	current: TimedNetworkCounters
): NetworkTraffic | null {
	const elapsedMilliseconds = sampledIntervalMilliseconds(previous, current);
	const receivedBytes = current.receivedBytes - previous.receivedBytes;
	const sentBytes = current.sentBytes - previous.sentBytes;
	if (elapsedMilliseconds === null || receivedBytes < 0 || sentBytes < 0) {
		return null;
	}
	const receivedBytesPerSecond = Math.round(
		(receivedBytes / elapsedMilliseconds) * systemMetricsSampleIntervalMilliseconds
	);
	const sentBytesPerSecond = Math.round((sentBytes / elapsedMilliseconds) * systemMetricsSampleIntervalMilliseconds);
	return isSafeNonnegativeInteger(receivedBytesPerSecond) && isSafeNonnegativeInteger(sentBytesPerSecond)
		? { receivedBytesPerSecond, sentBytesPerSecond }
		: null;
}

function cpuUsagePercentage(previous: TimedCpuCounters | null, current: TimedCpuCounters | null): number | null {
	if (!previous || !current || sampledIntervalMilliseconds(previous, current) === null) {
		return null;
	}
	const totalMilliseconds = current.totalMilliseconds - previous.totalMilliseconds;
	const idleMilliseconds = current.idleMilliseconds - previous.idleMilliseconds;
	if (totalMilliseconds <= 0 || idleMilliseconds < 0 || idleMilliseconds > totalMilliseconds) {
		return null;
	}
	return ((totalMilliseconds - idleMilliseconds) / totalMilliseconds) * 100;
}

async function unavailableOnFailure<Result>(operation: () => Result | Promise<Result>): Promise<Result | null> {
	try {
		return await operation();
	} catch {
		return null;
	}
}

function timerCanBeUnreferenced(timer: ReturnType<typeof setInterval>): timer is NodeJS.Timeout {
	return typeof timer === 'object' && timer !== null && 'unref' in timer;
}

function reportSamplingFailure(error: unknown): void {
	console.error('Shiori system metrics sampling failed.', error);
}

function reportHistoryPersistenceFailure(error: unknown): void {
	console.error('Shiori system metrics history could not be saved. It will be retried.', error);
}

/** Samples host resource counters and retains a compact, durable rolling network-peak history. */
export class SystemMetricsMonitor {
	#history: NetworkPeakBucket[] = [];
	#historyDirty = false;
	#metrics = emptyMetrics();
	#previousCpuCounters: TimedCpuCounters | null = null;
	#previousNetworkCounters: TimedNetworkCounters | null = null;
	#sampling: Promise<void> | null = null;
	#starting: Promise<void> | null = null;
	#started = false;
	#timer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly source: SystemMetricsSource = defaultSystemMetricsSource,
		private readonly historyStore: NetworkPeakHistoryStore = persistentNetworkPeakHistoryStore
	) {}

	async start(): Promise<void> {
		if (this.#started) {
			return;
		}
		this.#starting ??= this.initialize().finally(() => {
			this.#starting = null;
		});
		await this.#starting;
	}

	async stop(): Promise<void> {
		if (this.#timer !== undefined) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
		await this.#sampling;
		this.#started = false;
		this.#previousCpuCounters = null;
		this.#previousNetworkCounters = null;
		await this.flushHistory();
	}

	async sample(): Promise<void> {
		this.#sampling ??= this.collectSample().finally(() => {
			this.#sampling = null;
		});
		await this.#sampling;
	}

	snapshot(): ServerMetrics {
		return {
			...this.#metrics,
			memory: this.#metrics.memory ? { ...this.#metrics.memory } : null,
			network: this.#metrics.network ? { ...this.#metrics.network } : null,
			networkPeak48Hours: this.#metrics.networkPeak48Hours ? { ...this.#metrics.networkPeak48Hours } : null
		};
	}

	private async initialize(): Promise<void> {
		const history = await this.historyStore.load();
		this.#history = [...history];
		const now = this.source.now();
		this.pruneHistory(now);
		this.#metrics = { ...this.#metrics, networkPeak48Hours: this.currentNetworkPeak() };
		await this.sample();
		await this.flushHistory();
		const timer = setInterval(() => {
			void this.sample().catch(reportSamplingFailure);
		}, systemMetricsSampleIntervalMilliseconds);
		if (timerCanBeUnreferenced(timer)) {
			timer.unref();
		}
		this.#timer = timer;
		this.#started = true;
	}

	private async collectSample(): Promise<void> {
		const [cpuCounters, memory, networkCounters] = await Promise.all([
			unavailableOnFailure(() => this.source.cpuCounters()),
			unavailableOnFailure(() => this.source.memoryUsage()),
			unavailableOnFailure(() => this.source.networkCounters())
		]);
		const sampledAt = this.source.now();
		const currentCpuCounters = cpuCounters ? { ...cpuCounters, sampledAt } : null;
		const currentNetworkCounters = networkCounters ? { ...networkCounters, sampledAt } : null;
		const cpuUsagePercent = cpuUsagePercentage(this.#previousCpuCounters, currentCpuCounters);
		const network =
			this.#previousNetworkCounters && currentNetworkCounters
				? networkTrafficFromCounters(this.#previousNetworkCounters, currentNetworkCounters)
				: null;

		this.#previousCpuCounters = currentCpuCounters;
		this.#previousNetworkCounters = currentNetworkCounters;
		this.pruneHistory(sampledAt);
		const startedNewNetworkBucket = network ? this.recordNetworkPeak(network, sampledAt) : false;
		this.#metrics = {
			cpuUsagePercent,
			memory,
			network,
			networkPeak48Hours: this.currentNetworkPeak(),
			sampledAt
		};
		if (startedNewNetworkBucket) {
			await this.flushHistory();
		}
	}

	private recordNetworkPeak(network: NetworkTraffic, observedAt: number): boolean {
		const startedAt = bucketStartedAt(observedAt);
		const candidate: NetworkPeak = { ...network, observedAt };
		const latest = this.#history.at(-1);
		if (latest?.startedAt === startedAt) {
			if (networkTrafficTotal(candidate) > networkTrafficTotal(latest.peak)) {
				this.#history[this.#history.length - 1] = { peak: candidate, startedAt };
				this.#historyDirty = true;
			}
			return false;
		}

		const existingIndex = this.#history.findIndex((bucket) => bucket.startedAt === startedAt);
		if (existingIndex >= 0) {
			const existing = this.#history[existingIndex];
			if (networkTrafficTotal(candidate) > networkTrafficTotal(existing.peak)) {
				this.#history[existingIndex] = { peak: candidate, startedAt };
				this.#historyDirty = true;
			}
			return false;
		}

		const insertionIndex = this.#history.findIndex((bucket) => bucket.startedAt > startedAt);
		if (insertionIndex < 0) {
			this.#history.push({ peak: candidate, startedAt });
		} else {
			this.#history.splice(insertionIndex, 0, { peak: candidate, startedAt });
		}
		this.#historyDirty = true;
		return true;
	}

	private pruneHistory(now: number): void {
		const firstIncludedBucket = bucketStartedAt(now - networkPeakHistoryMilliseconds);
		const lastIncludedBucket = bucketStartedAt(now);
		const firstCurrentBucket = this.#history.findIndex((bucket) => bucket.startedAt >= firstIncludedBucket);
		const firstFutureBucket = this.#history.findIndex((bucket) => bucket.startedAt > lastIncludedBucket);
		const firstRetainedBucket = firstCurrentBucket < 0 ? this.#history.length : firstCurrentBucket;
		const onePastLastRetainedBucket = firstFutureBucket < 0 ? this.#history.length : firstFutureBucket;
		if (firstRetainedBucket > 0 || onePastLastRetainedBucket < this.#history.length) {
			this.#history = this.#history.slice(firstRetainedBucket, onePastLastRetainedBucket);
			this.#historyDirty = true;
		}

		const latest = this.#history.at(-1);
		if (latest && latest.peak.observedAt > now) {
			this.#history.pop();
			this.#historyDirty = true;
		}
	}

	private currentNetworkPeak(): NetworkPeak | null {
		let peak: NetworkPeak | null = null;
		for (const bucket of this.#history) {
			if (!peak || networkTrafficTotal(bucket.peak) > networkTrafficTotal(peak)) {
				peak = bucket.peak;
			}
		}
		return peak ? { ...peak } : null;
	}

	private async flushHistory(): Promise<void> {
		if (!this.#historyDirty) {
			return;
		}
		try {
			await this.historyStore.save(this.#history);
			this.#historyDirty = false;
		} catch (error: unknown) {
			reportHistoryPersistenceFailure(error);
		}
	}
}

const systemMetricsMonitor = new SystemMetricsMonitor();

/** Starts the singleton sampler once during server initialization. */
export async function initializeSystemMetrics(): Promise<void> {
	await systemMetricsMonitor.start();
}

/** Flushes the singleton sampler's pending network peak before the Node server exits. */
export async function shutdownSystemMetrics(): Promise<void> {
	await systemMetricsMonitor.stop();
}

/** Returns a stable snapshot for the admin page without exposing host data to other routes. */
export function serverMetricsSnapshot(): ServerMetrics {
	return systemMetricsMonitor.snapshot();
}
