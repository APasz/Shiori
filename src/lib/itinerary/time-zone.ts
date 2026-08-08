import type { ItineraryTiming, TransportDetails } from './schema';

type TimeZoneOverride = Readonly<{
	timeZone?: string;
}>;

export function resolveTimeZone(defaultTimeZone: string, value: TimeZoneOverride): string {
	return value.timeZone ?? defaultTimeZone;
}

export function resolveTimingTimeZone(timing: ItineraryTiming, tripTimeZone: string): string {
	return resolveTimeZone(tripTimeZone, timing);
}

export function resolveTransportStopTimeZone(stop: TransportDetails['stops'][number], timingTimeZone: string): string {
	return resolveTimeZone(timingTimeZone, stop);
}
