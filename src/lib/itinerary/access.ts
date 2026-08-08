import { z } from 'zod';
import type { Itinerary, ItineraryItem } from './schema';

export const tripAccessRoleSchema = z.enum(['visitor', 'user', 'admin', 'sudo']);

export type TripAccessRole = z.infer<typeof tripAccessRoleSchema>;
export type DetailedTripAccessRole = Exclude<TripAccessRole, 'visitor'>;

export type PublicItineraryItem = Pick<ItineraryItem, 'id' | 'timing' | 'type' | 'title'>;
export type PublicItinerary = Pick<Itinerary, 'title' | 'timeZone'> & {
	items: PublicItineraryItem[];
};

type RestrictedItineraryDetail = 'documents' | 'reservation' | 'transportPlatform' | 'transportSeat';

/** This is the single policy for data that is not visible to a standard shared user. */
export const itineraryDetailVisibility = {
	documents: 'admin',
	reservation: 'admin',
	transportPlatform: 'admin',
	transportSeat: 'admin'
} as const satisfies Record<RestrictedItineraryDetail, DetailedTripAccessRole>;

const accessRank = {
	visitor: 0,
	user: 1,
	admin: 2,
	sudo: 3
} as const satisfies Record<TripAccessRole, number>;

export function canViewItineraryDetail(access: DetailedTripAccessRole, detail: RestrictedItineraryDetail): boolean {
	return accessRank[access] >= accessRank[itineraryDetailVisibility[detail]];
}

export function projectPublicItinerary(itinerary: Itinerary): PublicItinerary {
	return {
		title: itinerary.title,
		timeZone: itinerary.timeZone,
		items: itinerary.items.map(({ id, timing, type, title }) => ({
			id,
			timing,
			type,
			title
		}))
	};
}

function projectDetailedItem(item: ItineraryItem, access: DetailedTripAccessRole): ItineraryItem {
	const documents = canViewItineraryDetail(access, 'documents') ? item.documents : [];
	const reservation = canViewItineraryDetail(access, 'reservation') ? item.reservation : undefined;

	if (item.type !== 'transport') {
		return { ...item, documents, reservation };
	}

	return {
		...item,
		documents,
		reservation,
		transport: {
			...item.transport,
			seat: canViewItineraryDetail(access, 'transportSeat') ? item.transport.seat : undefined,
			stops: item.transport.stops.map((stop) => ({
				...stop,
				platform: canViewItineraryDetail(access, 'transportPlatform') ? stop.platform : undefined
			}))
		}
	};
}

export function projectDetailedItinerary(itinerary: Itinerary, access: DetailedTripAccessRole): Itinerary {
	if (access === 'admin' || access === 'sudo') {
		return itinerary;
	}

	return {
		...itinerary,
		items: itinerary.items.map((item) => projectDetailedItem(item, access))
	};
}
