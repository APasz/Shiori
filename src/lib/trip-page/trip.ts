import type { DetailedTripView, TripView } from '$lib/server/store/views';

export function detailedTripFor(trip: TripView): DetailedTripView | null {
	return trip.access === 'visitor' ? null : trip;
}

export function itemMutationEndpoint(trip: DetailedTripView): string {
	return `/api/trips/${encodeURIComponent(trip.id)}/items`;
}
