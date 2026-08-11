import { z } from 'zod';
import { ianaTimeZoneSchema, unixTimestampSchema } from './schema';

export const transportJourneySchedulePointSchema = z.strictObject({
	scheduledAt: unixTimestampSchema,
	timeZone: ianaTimeZoneSchema
});

export const transportJourneyScheduleSchema = z.strictObject({
	arrival: transportJourneySchedulePointSchema,
	departure: transportJourneySchedulePointSchema
});

export type TransportJourneySchedule = z.infer<typeof transportJourneyScheduleSchema>;
