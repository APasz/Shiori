import type { ItineraryItem, ItineraryNote, ItineraryNoteEditorTarget } from '$lib/itinerary/schema';
import type { PublicItineraryItem } from '$lib/itinerary/access';
import type { AuthenticatedUser } from '$lib/server/store/model';
import type { TripView } from '$lib/server/store/views';

export type { ConnectivityStatus } from '$lib/connectivity.svelte';

export type TripPageData = Readonly<{
	canManageAccounts: boolean;
	currentUser: AuthenticatedUser | null;
	setupRequired: boolean;
	trip: TripView;
}>;

export type EditingItem = Readonly<{
	item: ItineraryItem;
	mode: 'create' | 'edit';
	suggestedEndDate?: string;
	suggestedStartDate?: string;
	timingNeedsConfirmation: boolean;
}>;

export type EditingNote = Readonly<{
	note: ItineraryNote | undefined;
	target: ItineraryNoteEditorTarget;
}>;

export type DayItem = ItineraryItem | PublicItineraryItem;
