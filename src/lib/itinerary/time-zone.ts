import type { ItineraryItem, ItineraryTiming, TransportDetails } from './schema';
import { resolveItemPlacementTemporalSource, resolveItemPlanTemporalSource } from './item-temporal';

type TimeZoneOverride = Readonly<{
	timeZone?: string;
}>;

export function resolveTimeZone(defaultTimeZone: string, value: TimeZoneOverride): string {
	return value.timeZone ?? defaultTimeZone;
}

export function resolveTimingTimeZone(timing: ItineraryTiming, tripTimeZone: string): string {
	return resolveTimeZone(tripTimeZone, timing);
}

/** Resolves the zone for either a scheduled item or its day-only placement. */
export function resolveItemTimeZone(item: Pick<ItineraryItem, 'placement' | 'timing'>, tripTimeZone: string): string {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		return resolveTimingTimeZone(plan.timing, tripTimeZone);
	}
	return resolveItemPlacementTemporalSource(item)?.placement.timeZone ?? tripTimeZone;
}

export function resolveTransportStopTimeZone(stop: TransportDetails['stops'][number], defaultTimeZone: string): string {
	return resolveTimeZone(defaultTimeZone, stop);
}
