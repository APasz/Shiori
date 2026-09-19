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
			availability: [
				{
					id: 'ticket-office-hours',
					label: 'Ticket office',
					timing: {
						endAt: Date.UTC(2026, 3, 12, 9),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 12),
						timeZone: 'Asia/Tokyo'
					},
					type: 'desk-hours'
				},
				{
					id: 'station-last-admission',
					timing: {
						at: Date.UTC(2026, 3, 12, 7, 30),
						kind: 'deadline',
						timeZone: 'Asia/Tokyo'
					},
					type: 'last-admission'
				}
			],
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
		expect(firstItem.availability).toEqual([
			{
				label: 'Ticket office',
				timing: {
					end: { at: '2026-04-12T09:00:00.000Z', timeZone: 'Asia/Tokyo' },
					kind: 'period',
					start: { at: '2026-04-12T00:00:00.000Z', timeZone: 'Asia/Tokyo' }
				},
				type: 'desk-hours'
			},
			{
				timing: {
					at: { at: '2026-04-12T07:30:00.000Z', timeZone: 'Asia/Tokyo' },
					kind: 'deadline'
				},
				type: 'last-admission'
			}
		]);
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
		expect(firstItem.availability[0]).not.toHaveProperty('id');
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
		expect(exported.items[0].availability).toMatchObject([
			{
				timing: {
					end: { at: Date.UTC(2026, 3, 12, 9), timeZone: 'Asia/Tokyo' },
					start: { at: Date.UTC(2026, 3, 12), timeZone: 'Asia/Tokyo' }
				}
			},
			{ timing: { at: { at: Date.UTC(2026, 3, 12, 7, 30), timeZone: 'Asia/Tokyo' } } }
		]);
		expect(exported.notes[1].anchorAt).toBe(Date.UTC(2026, 3, 13, 3));
		expect(exported.items[0].cost).toMatchObject({
			amount: 125,
			currency: 'USD',
			payment: { localAmount: 150, localCurrency: 'AUD', paidAt: 1_775_952_000_000 }
		});
		expect(exported.items[0].locations[0]).not.toHaveProperty('coordinates');
		expect(text).toContain('When: 1775952000000 (epoch milliseconds; Asia/Tokyo)');
		expect(text).toContain(
			`Ticket office · ${Date.UTC(2026, 3, 12)} (epoch milliseconds; Asia/Tokyo) – ${Date.UTC(
				2026,
				3,
				12,
				9
			)} (epoch milliseconds; Asia/Tokyo)`
		);
		expect(text).toContain('Day note · 1776049200000 (epoch milliseconds; Asia/Tokyo)');
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
		const text = renderItineraryExport(itinerary, 'txt', defaultItineraryExportOptions, {
			dateFormat: 'month-day-year',
			locale: 'en-US',
			timeFormat: 'twelve-hour'
		});
		const file = createItineraryExportFile(itinerary, 'yaml', defaultItineraryExportOptions);

		expect(text).toContain('Japan 2026');
		expect(text).toContain('When: 04-12-2026, 9:00 am (Asia/Tokyo)');
		expect(text).toContain('Availability:');
		expect(text).toContain('Ticket office · 9:00 am–6:00 pm');
		expect(text).toContain('Admission · 4:30 pm');
		expect(text).toContain('Tokyo Station · TYO — 04-12-2026, 9:00 am (Asia/Tokyo) · Platform 20');
		expect(text).toContain('Reservation: confirmed · JR · ABC123');
		expect(text).toContain('Cost: USD 125.00 (paid)');
		expect(text).toContain('Scheduled payment: 04-04-2026');
		expect(text).toContain('Notes:');
		expect(text).toContain('Trip note (Asia/Tokyo)');
		expect(text).toContain('Time: 10:00 am');
		expect(text).toContain('Estimate: Entry: JPY 3500 minor units');
		expect(text).toContain('Link: Museum details: https://example.com/museum');
		expect(text).toContain('Day note · 04-13-2026, 12:00 pm (Asia/Tokyo)');
		expect(file).toMatchObject({ filename: 'japan-2026-itinerary.yaml', mediaType: 'application/yaml' });
	});

	it('renders split availability in saved zones while keeping JSON and YAML structural', () => {
		const source = itinerarySchema.parse({
			items: [
				{
					availability: [
						{
							id: 'morning-opening',
							timing: {
								endAt: Date.UTC(2026, 3, 12, 3),
								kind: 'period',
								startAt: Date.UTC(2026, 3, 12, 1),
								timeZone: 'Asia/Tokyo'
							},
							type: 'opening-hours'
						},
						{
							id: 'afternoon-opening',
							timing: {
								endAt: Date.UTC(2026, 3, 12, 7),
								kind: 'period',
								startAt: Date.UTC(2026, 3, 12, 4),
								timeZone: 'Asia/Tokyo'
							},
							type: 'opening-hours'
						},
						{
							id: 'last-admission',
							timing: {
								at: Date.UTC(2026, 3, 12, 22, 30),
								kind: 'deadline',
								timeZone: 'America/Los_Angeles'
							},
							type: 'last-admission'
						}
					],
					id: 'museum',
					timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 12), timeZone: 'Asia/Tokyo' },
					title: 'Museum',
					type: 'activity'
				}
			],
			timeZone: 'Asia/Tokyo',
			title: 'Tokyo day'
		});
		const textFormat = { dateFormat: 'month-day-year' as const, locale: 'en-US', timeFormat: 'twelve-hour' as const };
		const json = JSON.parse(renderItineraryExport(source, 'json', defaultItineraryExportOptions));
		const yaml = parse(renderItineraryExport(source, 'yaml', defaultItineraryExportOptions));
		const text = renderItineraryExport(source, 'txt', defaultItineraryExportOptions, textFormat);

		expect(yaml).toEqual(json);
		expect(json.items[0].availability).toEqual([
			{
				timing: {
					end: { at: '2026-04-12T03:00:00.000Z', timeZone: 'Asia/Tokyo' },
					kind: 'period',
					start: { at: '2026-04-12T01:00:00.000Z', timeZone: 'Asia/Tokyo' }
				},
				type: 'opening-hours'
			},
			{
				timing: {
					end: { at: '2026-04-12T07:00:00.000Z', timeZone: 'Asia/Tokyo' },
					kind: 'period',
					start: { at: '2026-04-12T04:00:00.000Z', timeZone: 'Asia/Tokyo' }
				},
				type: 'opening-hours'
			},
			{
				timing: {
					at: { at: '2026-04-12T22:30:00.000Z', timeZone: 'America/Los_Angeles' },
					kind: 'deadline'
				},
				type: 'last-admission'
			}
		]);
		expect(text).toContain('Opening · 10:00 am–12:00 pm');
		expect(text).toContain('Opening · 1:00 pm–4:00 pm');
		expect(text).toContain('Admission · 04-12-2026, 3:30 pm (America/Los_Angeles)');
	});
});
