import type { ItineraryTiming, TransportDetails } from './schema';
import { timingStartTimestamp } from './timing';
import { resolveTimingTimeZone, resolveTransportStopTimeZone } from './time-zone';

export type TransportStopSchedule = Readonly<{
	scheduledAt: number;
	timeZone: string;
}>;

/** Uses a first-stop time only when the journey schedule is absent. */
export function resolveTransportScheduleStart(
	schedule: TransportStopSchedule | undefined,
	firstStopSchedule: TransportStopSchedule | undefined
): TransportStopSchedule | undefined {
	return schedule ?? firstStopSchedule;
}

/**
 * Resolves the time shown for a transport stop. The journey schedule fills in
 * only the first stop when that stop has no separately recorded time.
 */
export function resolveTransportStopSchedule(
	timing: ItineraryTiming,
	stop: TransportDetails['stops'][number],
	stopIndex: number,
	tripTimeZone: string
): TransportStopSchedule | undefined {
	const timingTimeZone = resolveTimingTimeZone(timing, tripTimeZone);
	if (stop.scheduledAt !== undefined) {
		return {
			scheduledAt: stop.scheduledAt,
			timeZone: resolveTransportStopTimeZone(stop, timingTimeZone)
		};
	}

	if (stopIndex !== 0) {
		return undefined;
	}

	return { scheduledAt: timingStartTimestamp(timing), timeZone: timingTimeZone };
}
