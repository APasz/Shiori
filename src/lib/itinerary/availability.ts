import type { ConstraintType, ItineraryItemType } from './schema';

type ItineraryRecord = Record<string, unknown>;

const availabilityTypeDetails = {
	'opening-hours': { editorLabel: 'Opening hours', presentationLabel: 'Opening' },
	'reception-hours': { editorLabel: 'Reception hours', presentationLabel: 'Reception' },
	'desk-hours': { editorLabel: 'Desk hours', presentationLabel: 'Desk' },
	'storage-hours': { editorLabel: 'Storage hours', presentationLabel: 'Storage' },
	'last-admission': { editorLabel: 'Last admission', presentationLabel: 'Admission' },
	cutoff: { editorLabel: 'Cutoff', presentationLabel: 'Cutoff' },
	other: { editorLabel: 'Other', presentationLabel: 'Other' }
} as const satisfies Record<ConstraintType, Readonly<{ editorLabel: string; presentationLabel: string }>>;

export const availabilityTypeSuggestions = {
	activity: ['opening-hours', 'last-admission', 'desk-hours', 'other'],
	accommodation: ['reception-hours', 'storage-hours', 'desk-hours', 'other'],
	transport: ['desk-hours', 'cutoff', 'storage-hours', 'other']
} as const satisfies Record<ItineraryItemType, readonly ConstraintType[]>;

export function availabilityTypeEditorLabel(type: ConstraintType): string {
	return availabilityTypeDetails[type].editorLabel;
}

export function availabilityTypePresentationLabel(type: ConstraintType): string {
	return availabilityTypeDetails[type].presentationLabel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Adds the persisted availability default to pre-availability item records without changing supplied values. */
export function migrateLegacyItemAvailability<SourceItinerary extends ItineraryRecord>(
	itinerary: SourceItinerary
): SourceItinerary {
	if (!Array.isArray(itinerary.items)) {
		return itinerary;
	}

	return {
		...itinerary,
		items: itinerary.items.map((item) =>
			isRecord(item) && !Object.hasOwn(item, 'availability') ? { ...item, availability: [] } : item
		)
	};
}
