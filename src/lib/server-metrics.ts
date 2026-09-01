import { z } from 'zod';
import { unixTimestampSchema } from '$lib/unix-timestamp-schema';

const byteCountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const byteRateSchema = byteCountSchema;

export const memoryUsageSchema = z
	.strictObject({
		totalBytes: byteCountSchema.positive(),
		usedBytes: byteCountSchema
	})
	.refine((usage) => usage.usedBytes <= usage.totalBytes, 'Used memory cannot exceed total memory.');

export const networkTrafficSchema = z.strictObject({
	receivedBytesPerSecond: byteRateSchema,
	sentBytesPerSecond: byteRateSchema
});

export const networkPeakSchema = networkTrafficSchema.extend({
	observedAt: unixTimestampSchema
});

export const serverMetricsSchema = z.strictObject({
	cpuUsagePercent: z.number().finite().min(0).max(100).nullable(),
	memory: memoryUsageSchema.nullable(),
	network: networkTrafficSchema.nullable(),
	networkPeak48Hours: networkPeakSchema.nullable(),
	sampledAt: unixTimestampSchema.nullable()
});

export type MemoryUsage = z.infer<typeof memoryUsageSchema>;
export type NetworkTraffic = z.infer<typeof networkTrafficSchema>;
export type NetworkPeak = z.infer<typeof networkPeakSchema>;
export type ServerMetrics = z.infer<typeof serverMetricsSchema>;
