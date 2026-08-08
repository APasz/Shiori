import { describe, expect, it } from 'vitest';
import { itineraryItemImportSchema } from '$lib/editing/contracts';
import { createItineraryItemFromImport } from './draft';
import { itineraryItemSchema } from './schema';

describe('imported itinerary item drafts', () => {
	it('creates linked transport stops for each imported location', () => {
		const itemImport = itineraryItemImportSchema.parse({
			type: 'transport',
			title: 'JQ13 from SYD to KIX',
			locations: [
				{ name: 'SYD', role: 'departure' },
				{ name: 'KIX', role: 'arrival' }
			],
			links: [{ label: 'Google Flights', url: 'https://www.google.com/travel/flights/booking' }],
			transport: { mode: 'air', operator: 'Jetstar', serviceNumber: '13' }
		});

		const item = createItineraryItemFromImport(itemImport, 'jq13', Date.UTC(2026, 9, 27));

		expect(itineraryItemSchema.parse(item)).toMatchObject({
			id: 'jq13',
			title: 'JQ13 from SYD to KIX',
			transport: {
				mode: 'air',
				operator: 'Jetstar',
				serviceNumber: '13',
				stops: [{ locationId: item.locations[0]?.id }, { locationId: item.locations[1]?.id }]
			}
		});
	});
});
