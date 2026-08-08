import type { ItineraryItemType, TransportDetails } from './schema';

export const itineraryIllustrationKinds = [
	'activity',
	'accommodation',
	'air',
	'bus',
	'car',
	'ferry',
	'rail',
	'route',
	'walk'
] as const;

export type ItineraryIllustrationKind = (typeof itineraryIllustrationKinds)[number];

export type ItineraryIllustrationSource = Readonly<{
	type: ItineraryItemType;
	transport?: Pick<TransportDetails, 'mode'>;
}>;

/** Selects the decorative illustration that represents an itinerary item's type. */
export function itineraryIllustration(item: ItineraryIllustrationSource): ItineraryIllustrationKind {
	if (item.type === 'activity' || item.type === 'accommodation') {
		return item.type;
	}
	if (!item.transport) {
		return 'route';
	}

	switch (item.transport.mode) {
		case 'air':
			return 'air';
		case 'bus':
			return 'bus';
		case 'car':
		case 'ride-share':
			return 'car';
		case 'ferry':
			return 'ferry';
		case 'rail':
			return 'rail';
		case 'walk':
			return 'walk';
		case 'other':
			return 'route';
	}
}
