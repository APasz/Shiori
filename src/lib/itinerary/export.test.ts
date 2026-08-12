import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { createItineraryExportFile, defaultItineraryExportOptions, renderItineraryExport } from './export';
import { itinerarySchema } from './schema';

const itinerary = itinerarySchema.parse({
	items: [
		{
			cost: {
				amount: 12_500,
				currency: 'USD',
				payment: {
					exchangeRate: 1.2,
					localAmount: 15_000,
					localCurrency: 'AUD',
					paidAt: 1_775_952_000_000,
					rateDate: '2026-04-03'
				},
				status: 'paid'
			},
			documents: [{ kind: 'ticket', title: 'Rail ticket', url: 'https://example.com/ticket' }],
			id: 'train-to-kyoto',
			links: [{ label: 'Operator', url: 'https://example.com/operator' }],
			locations: [
				{
					coordinates: { latitude: 35.6812, longitude: 139.7671 },
					id: 'tokyo',
					name: 'Tokyo Station',
					role: 'departure'
				},
				{ id: 'kyoto', name: 'Kyoto Station', role: 'arrival' }
			],
			notes: ['Bring the rail pass.'],
			reservation: { provider: 'JR', reference: 'ABC123', status: 'confirmed' },
			timing: { kind: 'exact', startAt: 1_775_952_000_000 },
			title: 'Shinkansen to Kyoto',
			transport: {
				mode: 'rail',
				operator: 'JR',
				seat: '12A',
				serviceNumber: 'Nozomi 15',
				stops: [{ locationId: 'tokyo', platform: '20', scheduledAt: 1_775_952_000_000 }, { locationId: 'kyoto' }]
			},
			type: 'transport'
		},
		{
			id: 'dinner',
			timing: { earliestAt: 1_776_003_600_000, kind: 'window', latestAt: 1_776_007_200_000 },
			title: 'Dinner',
			type: 'activity'
		}
	],
	localCurrency: 'AUD',
	timeZone: 'Asia/Tokyo',
	title: 'Japan 2026'
});

describe('itinerary exports', () => {
	it('renders a portable JSON snapshot without internal identifiers', () => {
		const exported = JSON.parse(renderItineraryExport(itinerary, 'json', defaultItineraryExportOptions));

		expect(exported).toMatchObject({
			version: 1,
			title: 'Japan 2026',
			timeZone: 'Asia/Tokyo',
			localCurrency: 'AUD'
		});
		const firstItem = exported.items[0];
		expect(firstItem.title).toBe('Shinkansen to Kyoto');
		expect(firstItem.timing).toEqual({
			kind: 'exact',
			start: { at: '2026-04-12T00:00:00.000Z', timeZone: 'Asia/Tokyo' }
		});
		expect(firstItem.locations[0]).toMatchObject({
			coordinates: { latitude: 35.6812, longitude: 139.7671 },
			name: 'Tokyo Station',
			role: 'departure'
		});
		expect(firstItem.transport).toMatchObject({ mode: 'rail' });
		expect(firstItem.transport.stops[0]).toMatchObject({
			location: 'Tokyo Station',
			scheduledAt: expect.any(Object)
		});
		expect(firstItem.reservation).toEqual({ provider: 'JR', reference: 'ABC123', status: 'confirmed' });
		expect(firstItem.cost).toMatchObject({ amount: 12_500, currency: 'USD', status: 'paid' });
		expect(firstItem).not.toHaveProperty('id');
		expect(firstItem.locations[0]).not.toHaveProperty('id');
		expect(firstItem.transport.stops[0]).not.toHaveProperty('locationId');
	});

	it('uses the same data for YAML and omits unchecked details in every format', () => {
		const options = {
			...defaultItineraryExportOptions,
			includeCosts: false,
			includeLinksAndDocuments: false,
			includeNotes: false,
			includeReservationDetails: false
		};
		const json = JSON.parse(renderItineraryExport(itinerary, 'json', options));
		const yaml = parse(renderItineraryExport(itinerary, 'yaml', options));

		expect(yaml).toEqual(json);
		expect(json.items[0]).not.toHaveProperty('cost');
		expect(json.items[0]).not.toHaveProperty('documents');
		expect(json.items[0]).not.toHaveProperty('links');
		expect(json.items[0]).not.toHaveProperty('notes');
		expect(json.items[0]).not.toHaveProperty('reservation');
	});

	it('switches timestamps, cost amounts, and coordinates independently', () => {
		const options = {
			...defaultItineraryExportOptions,
			includeCoordinates: false,
			normalizeCostAmounts: true,
			useEpochTimestamps: true
		};
		const exported = JSON.parse(renderItineraryExport(itinerary, 'json', options));
		const text = renderItineraryExport(itinerary, 'txt', options);

		expect(exported.items[0].timing.start).toEqual({ at: 1_775_952_000_000, timeZone: 'Asia/Tokyo' });
		expect(exported.items[0].transport.stops[0].scheduledAt).toEqual({
			at: 1_775_952_000_000,
			timeZone: 'Asia/Tokyo'
		});
		expect(exported.items[0].cost).toMatchObject({
			amount: 125,
			currency: 'USD',
			payment: { localAmount: 150, localCurrency: 'AUD', paidAt: 1_775_952_000_000 }
		});
		expect(exported.items[0].locations[0]).not.toHaveProperty('coordinates');
		expect(text).toContain('When: 1775952000000 (epoch milliseconds; Asia/Tokyo)');
		expect(text).toContain('Cost: USD 125.00 (paid)');
	});

	it('renders a readable text itinerary and names its download from the trip title', () => {
		const text = renderItineraryExport(itinerary, 'txt', defaultItineraryExportOptions);
		const file = createItineraryExportFile(itinerary, 'yaml', defaultItineraryExportOptions);

		expect(text).toContain('Japan 2026');
		expect(text).toContain('When: 2026-04-12T00:00:00.000Z (Asia/Tokyo)');
		expect(text).toContain('Reservation: confirmed · JR · ABC123');
		expect(text).toContain('Cost: USD 12500 minor units (paid)');
		expect(file).toMatchObject({ filename: 'japan-2026-itinerary.yaml', mediaType: 'application/yaml' });
	});
});
