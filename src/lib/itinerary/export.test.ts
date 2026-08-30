import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
	createItineraryExportFile,
	defaultItineraryExportOptions,
	itineraryExportVersion,
	renderItineraryExport
} from './export';
import { itinerarySchema } from './schema';

const itinerary = itinerarySchema.parse({
	items: [
		{
			cost: {
				amountMinor: 12_500,
				currency: 'USD',
				scheduledPaymentDate: '2026-04-04',
				payment: {
					exchangeRate: 1.2,
					localAmountMinor: 15_000,
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
					code: 'TYO',
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
	notes: [
		{
			entries: [
				{
					estimatedCosts: [{ amountMinor: 3_500, currency: 'JPY', id: 'museum-entry-cost', label: 'Entry' }],
					id: 'museum-entry',
					links: [{ label: 'Museum details', url: 'https://example.com/museum' }],
					note: 'Book tickets before arrival.',
					state: 'shortlisted',
					startTime: '10:00',
					title: 'Museum option'
				}
			],
			kind: 'trip',
			text: 'Keep the second afternoon flexible.',
			timeZone: 'Asia/Tokyo'
		},
		{
			anchorAt: Date.UTC(2026, 3, 13, 3),
			entries: [],
			id: 'day-note-2026-04-13',
			kind: 'day',
			text: 'Check the weather before choosing an outdoor plan.',
			timeZone: 'Asia/Tokyo'
		}
	],
	timeZone: 'Asia/Tokyo',
	title: 'Japan 2026'
});

describe('itinerary exports', () => {
	it('renders a portable JSON snapshot without internal identifiers', () => {
		const exported = JSON.parse(renderItineraryExport(itinerary, 'json', defaultItineraryExportOptions));

		expect(exported).toMatchObject({
			version: itineraryExportVersion,
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
			code: 'TYO',
			coordinates: { latitude: 35.6812, longitude: 139.7671 },
			name: 'Tokyo Station',
			role: 'departure'
		});
		expect(firstItem.transport).toMatchObject({ mode: 'rail' });
		expect(firstItem.transport.stops[0]).toMatchObject({
			code: 'TYO',
			location: 'Tokyo Station',
			scheduledAt: expect.any(Object)
		});
		expect(firstItem.reservation).toEqual({ provider: 'JR', reference: 'ABC123', status: 'confirmed' });
		expect(firstItem.cost).toMatchObject({ amount: 125, currency: 'USD', status: 'paid' });
		expect(firstItem.cost).toMatchObject({ scheduledPaymentDate: '2026-04-04' });
		expect(firstItem).not.toHaveProperty('id');
		expect(firstItem.locations[0]).not.toHaveProperty('id');
		expect(firstItem.transport.stops[0]).not.toHaveProperty('locationId');
		expect(exported.notes).toMatchObject([
			{
				entries: [
					{
						estimatedCosts: [{ amountMinor: 3_500, currency: 'JPY', label: 'Entry' }],
						links: [{ label: 'Museum details', url: 'https://example.com/museum' }],
						note: 'Book tickets before arrival.',
						state: 'shortlisted',
						startTime: '10:00',
						title: 'Museum option'
					}
				],
				kind: 'trip',
				text: 'Keep the second afternoon flexible.',
				timeZone: 'Asia/Tokyo'
			},
			{
				anchorAt: '2026-04-13T03:00:00.000Z',
				entries: [],
				kind: 'day',
				text: 'Check the weather before choosing an outdoor plan.',
				timeZone: 'Asia/Tokyo'
			}
		]);
		expect(exported.notes[0].entries[0]).not.toHaveProperty('id');
		expect(exported.notes[0].entries[0].estimatedCosts[0]).not.toHaveProperty('id');
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
		expect(json).not.toHaveProperty('notes');
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
		expect(exported.notes[1].anchorAt).toBe(Date.UTC(2026, 3, 13, 3));
		expect(exported.items[0].cost).toMatchObject({
			amount: 125,
			currency: 'USD',
			payment: { localAmount: 150, localCurrency: 'AUD', paidAt: 1_775_952_000_000 }
		});
		expect(exported.items[0].locations[0]).not.toHaveProperty('coordinates');
		expect(text).toContain('When: 1775952000000 (epoch milliseconds; Asia/Tokyo)');
		expect(text).toContain('Cost: USD 125.00 (paid)');
		expect(text).toContain('Scheduled payment: 2026-04-04');
	});

	it('preserves explicit minor-unit fields when cost normalization is disabled', () => {
		const exported = JSON.parse(
			renderItineraryExport(itinerary, 'json', { ...defaultItineraryExportOptions, normalizeCostAmounts: false })
		);

		expect(exported.items[0].cost).toMatchObject({
			amountMinor: 12_500,
			currency: 'USD',
			payment: { localAmountMinor: 15_000, localCurrency: 'AUD' },
			status: 'paid'
		});
	});

	it('renders a readable text itinerary and names its download from the trip title', () => {
		const text = renderItineraryExport(itinerary, 'txt', defaultItineraryExportOptions);
		const file = createItineraryExportFile(itinerary, 'yaml', defaultItineraryExportOptions);

		expect(text).toContain('Japan 2026');
		expect(text).toContain('When: 2026-04-12T00:00:00.000Z (Asia/Tokyo)');
		expect(text).toContain('Reservation: confirmed · JR · ABC123');
		expect(text).toContain('Cost: USD 125.00 (paid)');
		expect(text).toContain('Notes:');
		expect(text).toContain('Trip note (Asia/Tokyo)');
		expect(text).toContain('Estimate: Entry: JPY 3500 minor units');
		expect(text).toContain('Link: Museum details: https://example.com/museum');
		expect(text).toContain('Day note · 2026-04-13T03:00:00.000Z (Asia/Tokyo)');
		expect(file).toMatchObject({ filename: 'japan-2026-itinerary.yaml', mediaType: 'application/yaml' });
	});
});
