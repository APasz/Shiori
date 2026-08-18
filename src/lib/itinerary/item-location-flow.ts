import type { ItineraryItem, ItineraryLocation, ItineraryTiming } from './schema';
import { timingStartTimestamp } from './timing';
import { resolveTransportStopSchedule, type TransportStopSchedule } from './transport-stop-schedule';

export type TransportStopLocationFlowEntry = Readonly<{
	kind: 'transport-stop';
	location: ItineraryLocation;
	platform?: string;
	schedule?: TransportStopSchedule;
	hasScheduledTime: boolean;
}>;

export type ItemLocationFlowEntry =
	| Readonly<{
			kind: 'location';
			location: ItineraryLocation;
	  }>
	| TransportStopLocationFlowEntry;

const millisecondsPerMinute = 60_000;

function requireItemLocation(item: ItineraryItem, locationId: string): ItineraryLocation {
	const location = item.locations.find((candidate) => candidate.id === locationId);
	if (!location) {
		throw new Error(`Transport stop ${locationId} does not reference an item location.`);
	}
	return location;
}

/** Returns each item location once, in its chronological transport-stop order when applicable. */
export function itemLocationFlow(item: ItineraryItem, tripTimeZone: string): readonly ItemLocationFlowEntry[] {
	if (item.type !== 'transport') {
		return item.locations.map((location) => ({ kind: 'location', location }));
	}

	return item.transport.stops.map((stop, stopIndex) => {
		const schedule = resolveTransportStopSchedule(item.timing, stop, stopIndex, tripTimeZone);
		return {
			kind: 'transport-stop',
			location: requireItemLocation(item, stop.locationId),
			hasScheduledTime: stop.scheduledAt !== undefined,
			...(stop.platform ? { platform: stop.platform } : {}),
			...(schedule ? { schedule } : {})
		};
	});
}

/** Hides a first-stop time only when the item's start already conveys the same information. */
export function shouldShowTransportStopSchedule(
	entry: TransportStopLocationFlowEntry,
	stopIndex: number,
	timing: ItineraryTiming
): boolean {
	if (!entry.schedule) {
		return false;
	}
	if (stopIndex !== 0) {
		return true;
	}
	if (!entry.hasScheduledTime) {
		return false;
	}
	return (
		timing.kind !== 'exact' ||
		timing.timePrecision === 'date' ||
		entry.schedule.scheduledAt !== timingStartTimestamp(timing)
	);
}

function scheduledTimestamp(entry: ItemLocationFlowEntry | undefined): number | undefined {
	if (entry?.kind !== 'transport-stop' || !entry.hasScheduledTime || !entry.schedule) {
		return undefined;
	}
	return entry.schedule.scheduledAt;
}

/** Returns the elapsed travel time only for two consecutive, explicitly scheduled stops. */
export function transportTravelDuration(
	previousEntry: ItemLocationFlowEntry | undefined,
	nextEntry: ItemLocationFlowEntry
): string | undefined {
	const previousTimestamp = scheduledTimestamp(previousEntry);
	const nextTimestamp = scheduledTimestamp(nextEntry);
	if (previousTimestamp === undefined || nextTimestamp === undefined) {
		return undefined;
	}

	const totalMinutes = Math.round((nextTimestamp - previousTimestamp) / millisecondsPerMinute);
	if (totalMinutes <= 0) {
		return undefined;
	}

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) {
		return `${minutes}m`;
	}
	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
