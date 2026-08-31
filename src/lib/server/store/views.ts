import type { PublicItinerary } from '$lib/itinerary/access';
import type { Itinerary } from '$lib/itinerary/schema';
import type { StoredEditLock, TripMemberRole } from './model';

export type VisitorTripView = {
	access: 'visitor';
	canEdit: false;
	id: string;
	isPublic: boolean;
	revision: number;
	slug: string;
	itinerary: PublicItinerary;
};

export type DetailedTripView = {
	access: 'user' | 'admin' | 'sudo';
	canEdit: boolean;
	id: string;
	isPublic: boolean;
	revision: number;
	slug: string;
	itinerary: Itinerary;
};

export type TripView = VisitorTripView | DetailedTripView;

/** Server-only source data for deriving a page's safe metadata without serializing restricted details. */
export type TripPageView = Readonly<{
	sourceItinerary: Itinerary;
	trip: TripView;
}>;

export type TripReference = {
	id: string;
	slug: string;
};

export type TripSwitchOption = {
	latestItemStartAt: number | null;
	slug: string;
	title: string;
	updatedAt: number;
};

export type OwnedTripOption = {
	id: string;
	slug: string;
	title: string;
};

export type TripMember = {
	id: string;
	role: TripMemberRole | 'sudo';
	username: string;
};

export type EditLock = Pick<StoredEditLock, 'expiresAt' | 'revisionAtStart' | 'token'>;
