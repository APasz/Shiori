import type { TransportDetails } from './schema';

export type TransportServiceTimeRole = 'departure' | 'arrival' | 'via';

/** A factual, non-persisted time published for one transport stop. */
export type TransportServiceTime = Readonly<{
	at: number;
	locationId: string;
	role: TransportServiceTimeRole;
	source: 'service';
	timeZone: string;
}>;

type TransportServiceTimingInput = Readonly<{
	stops: readonly TransportDetails['stops'][number][];
}>;

const transportServiceTimeLabels = {
	arrival: 'Scheduled arrival',
	departure: 'Scheduled departure',
	via: 'Scheduled stop'
} as const satisfies Record<TransportServiceTimeRole, string>;

/** Resolves a stop's transport role from its journey position. */
export function transportServiceTimeRoleForStop(stopIndex: number, stopCount: number): TransportServiceTimeRole {
	if (!Number.isInteger(stopIndex) || !Number.isInteger(stopCount) || stopIndex < 0 || stopIndex >= stopCount) {
		throw new Error(`Transport stop index ${stopIndex} is invalid for ${stopCount} stops.`);
	}
	if (stopIndex === 0) {
		return 'departure';
	}
	return stopIndex === stopCount - 1 ? 'arrival' : 'via';
}

/** Labels a factual transport service time without conflating it with the item's Plan. */
export function transportServiceTimeLabel(role: TransportServiceTimeRole): string {
	return transportServiceTimeLabels[role];
}

/** Derives every explicitly scheduled transport service time in journey order. */
export function resolveTransportServiceTimes(
	transport: TransportServiceTimingInput,
	defaultTimeZone: string
): TransportServiceTime[] {
	const serviceTimes: TransportServiceTime[] = [];
	for (const [stopIndex, stop] of transport.stops.entries()) {
		if (stop.scheduledAt === undefined) {
			continue;
		}
		serviceTimes.push({
			at: stop.scheduledAt,
			locationId: stop.locationId,
			role: transportServiceTimeRoleForStop(stopIndex, transport.stops.length),
			source: 'service',
			timeZone: stop.timeZone ?? defaultTimeZone
		});
	}
	return serviceTimes;
}

/** Selects the first explicitly scheduled transport service time, if any. */
export function firstScheduledTransportServiceTime(
	serviceTimes: readonly TransportServiceTime[]
): TransportServiceTime | undefined {
	return serviceTimes[0];
}

/** Selects the last explicitly scheduled transport service time, if any. */
export function lastScheduledTransportServiceTime(
	serviceTimes: readonly TransportServiceTime[]
): TransportServiceTime | undefined {
	return serviceTimes[serviceTimes.length - 1];
}
