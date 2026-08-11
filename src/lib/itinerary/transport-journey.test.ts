import { describe, expect, it } from 'vitest';
import { itineraryItemImportSchema } from '$lib/editing/contracts';
import { itineraryItemSchema } from './schema';
import {
	createTransportJourneyItem,
	transportRouteTitle,
	transportJourneyDraftFromImport,
	transportJourneyTitle
} from './transport-journey';

describe('transport journey drafts', () => {
	it('creates a transport item with linked departure and arrival stops', () => {
		const item = createTransportJourneyItem(
			{
				departure: { name: 'Melbourne Airport', coordinates: { latitude: -37.6708, longitude: 144.843 } },
				arrival: { name: 'Tokyo Haneda Airport' },
				mode: 'air',
				operator: 'Jetstar',
				serviceNumber: '35',
				sourceLinks: []
			},
			'melbourne-to-tokyo',
			Date.UTC(2026, 9, 27)
		);

		expect(itineraryItemSchema.parse(item)).toMatchObject({
			title: 'Melbourne > Tokyo Haneda',
			locations: [
				{ name: 'Melbourne Airport', role: 'departure' },
				{ name: 'Tokyo Haneda Airport', role: 'arrival' }
			],
			transport: {
				mode: 'air',
				stops: [{ locationId: item.locations[0]?.id }, { locationId: item.locations[1]?.id }]
			}
		});
	});

	it('uses concise endpoint names in generated route titles', () => {
		expect(transportRouteTitle('Kansai International Airport', 'Flinders Street Station')).toBe(
			'Kansai > Flinders Street'
		);
	});

	it('turns an imported transport item into a journey that can be reviewed step by step', () => {
		const itemImport = itineraryItemImportSchema.parse({
			type: 'transport',
			title: 'JQ13 from SYD to KIX',
			suggestedStartDate: '2026-10-27',
			locations: [
				{ name: 'SYD', role: 'departure' },
				{ name: 'KIX', role: 'arrival' }
			],
			links: [{ label: 'Google Flights', url: 'https://www.google.com/travel/flights/booking' }],
			transport: { mode: 'air', operator: 'Jetstar', serviceNumber: '13' }
		});

		const journey = transportJourneyDraftFromImport(itemImport);

		expect(journey).toEqual({
			departure: { name: 'SYD' },
			arrival: { name: 'KIX' },
			mode: 'air',
			operator: 'Jetstar',
			serviceNumber: '13',
			suggestedStartDate: '2026-10-27',
			title: 'JQ13 from SYD to KIX',
			sourceLinks: [{ label: 'Google Flights', url: 'https://www.google.com/travel/flights/booking' }]
		});
		expect(transportJourneyTitle(journey)).toBe('JQ13 from SYD to KIX');
	});

	it('preserves an externally confirmed departure and arrival schedule', () => {
		const item = createTransportJourneyItem(
			{
				departure: { name: 'Kansai International Airport' },
				arrival: { name: 'Sydney Kingsford Smith Airport' },
				mode: 'air',
				sourceLinks: [],
				schedule: {
					departure: { scheduledAt: Date.UTC(2026, 10, 4, 11, 45), timeZone: 'Asia/Tokyo' },
					arrival: { scheduledAt: Date.UTC(2026, 10, 4, 21, 40), timeZone: 'Australia/Sydney' }
				}
			},
			'kix-to-syd',
			Date.UTC(2026, 10, 4)
		);

		expect(item).toMatchObject({
			timing: { kind: 'exact', startAt: Date.UTC(2026, 10, 4, 11, 45), timeZone: 'Asia/Tokyo' },
			transport: {
				stops: [
					{ locationId: item.locations[0]?.id, scheduledAt: Date.UTC(2026, 10, 4, 11, 45) },
					{
						locationId: item.locations[1]?.id,
						scheduledAt: Date.UTC(2026, 10, 4, 21, 40),
						timeZone: 'Australia/Sydney'
					}
				]
			}
		});
	});
});
