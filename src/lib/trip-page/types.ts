import type { ItineraryItem, ItineraryNote, ItineraryNoteTarget } from '$lib/itinerary/schema';
import type { PublicItineraryItem } from '$lib/itinerary/access';
import type { AuthenticatedUser } from '$lib/server/store/model';
import type { TripSwitchOption, TripView } from '$lib/server/store/views';

export type TripPageData = Readonly<{
	currentUser: AuthenticatedUser | null;
	setupRequired: boolean;
	trip: TripView;
	trips: TripSwitchOption[];
}>;

export type ConnectivityStatus = 'checking' | 'reachable' | 'unreachable';

export type EditingItem = Readonly<{
	item: ItineraryItem;
	mode: 'create' | 'edit';
	suggestedEndDate?: string;
	suggestedStartDate?: string;
	timingNeedsConfirmation: boolean;
}>;

export type EditingNote = Readonly<{
	note: ItineraryNote | undefined;
	target: ItineraryNoteTarget;
}>;

export type DayItem = ItineraryItem | PublicItineraryItem;
