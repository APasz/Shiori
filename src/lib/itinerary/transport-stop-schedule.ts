import type { ItineraryTiming, TransportDetails } from './schema';
import {
	resolveTransportStopServiceTemporalSource,
	resolveTransportStopTemporalPresentation,
	type TransportStopTemporalPresentation
} from './item-temporal';

export type TransportStopSchedule = Readonly<{
	scheduledAt: number;
	timeZone: string;
}>;

function scheduleForTemporalPresentation(
	presentation: TransportStopTemporalPresentation | undefined
): TransportStopSchedule | undefined {
	return presentation ? { scheduledAt: presentation.at, timeZone: presentation.timeZone } : undefined;
}

/** Uses a first-stop time only when the journey schedule is absent. */
export function resolveTransportScheduleStart(
	schedule: TransportStopSchedule | undefined,
	firstStopSchedule: TransportStopSchedule | undefined
): TransportStopSchedule | undefined {
	return schedule ?? firstStopSchedule;
}

/** Resolves an explicitly scheduled first stop without creating a journey schedule. */
export function resolveFirstTransportStopSchedule(
	transport: Pick<TransportDetails, 'stops'>,
	defaultTimeZone: string
): TransportStopSchedule | undefined {
	const firstStop = transport.stops[0];
	return firstStop
		? scheduleForTemporalPresentation(resolveTransportStopServiceTemporalSource(firstStop, 0, defaultTimeZone))
		: undefined;
}

/**
 * Resolves the time shown for a transport stop. The journey schedule fills in
 * only the first stop when that stop has no separately recorded time.
 */
export function resolveTransportStopSchedule(
	timing: ItineraryTiming | undefined,
	stop: TransportDetails['stops'][number],
	stopIndex: number,
	defaultTimeZone: string
): TransportStopSchedule | undefined {
	return scheduleForTemporalPresentation(
		resolveTransportStopTemporalPresentation(timing, stop, stopIndex, defaultTimeZone)
	);
}
