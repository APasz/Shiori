import type { ItineraryItem, ItineraryLocation } from './schema';
import { resolveItemServiceTemporalSources } from './item-temporal';
import type { TransportServiceTime } from './transport-service-timing';

export type TransportStopLocationFlowEntry = Readonly<{
	kind: 'transport-stop';
	location: ItineraryLocation;
	platform?: string;
	service?: TransportServiceTime;
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
export function itemLocationFlow(
	item: ItineraryItem,
	tripTimeZone: string,
	serviceSources?: readonly TransportServiceTime[]
): readonly ItemLocationFlowEntry[] {
	if (item.type !== 'transport') {
		return item.locations.map((location) => ({ kind: 'location', location }));
	}

	const services = serviceSources ?? resolveItemServiceTemporalSources(item, tripTimeZone);
	const serviceByLocationId = new Map<string, TransportServiceTime>();
	for (const service of services) {
		serviceByLocationId.set(service.locationId, service);
	}
	return item.transport.stops.map((stop) => {
		const service = serviceByLocationId.get(stop.locationId);
		return {
			kind: 'transport-stop',
			location: requireItemLocation(item, stop.locationId),
			...(stop.platform ? { platform: stop.platform } : {}),
			...(service ? { service } : {})
		};
	});
}

function scheduledTimestamp(entry: ItemLocationFlowEntry | undefined): number | undefined {
	if (entry?.kind !== 'transport-stop') {
		return undefined;
	}
	return entry.service?.at;
}

/** Returns elapsed travel time only for consecutive stops with explicit service times. */
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
