type ItineraryRecord = Record<string, unknown>;

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
