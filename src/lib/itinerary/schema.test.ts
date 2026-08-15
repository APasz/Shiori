import { describe, expect, it } from 'vitest';
import { isOpenRailwayMapUrl, itineraryItemDraftSchema, itineraryItemSchema, itinerarySchema } from './schema';

const itemBase = {
	id: 'sample-item',
	title: 'Sample item',
	type: 'activity' as const
};

const transportItem = {
	id: 'sample-transport',
	locations: [
		{ id: 'departure', name: 'Departure', role: 'departure' as const },
		{ id: 'arrival', name: 'Arrival', role: 'arrival' as const }
	],
	timing: { kind: 'exact' as const, startAt: 1_775_952_000_000 },
	title: 'Sample transport',
	transport: {
		mode: 'rail' as const,
		stops: [{ locationId: 'departure' }, { locationId: 'arrival' }]
	},
	type: 'transport' as const
};

describe('itinerary timing schema', () => {
	it('accepts every supported timing shape', () => {
		const timings = [
			{ kind: 'exact', startAt: 1_775_952_000_000 },
			{ kind: 'exact', startAt: 1_775_952_000_000, endAt: 1_775_955_600_000, timePrecision: 'date' },
			{ kind: 'approximate', nominalAt: 1_775_952_000_000, toleranceMinutes: 60 },
			{ kind: 'window', earliestAt: 1_775_952_000_000, latestAt: 1_775_955_600_000 }
		] as const;

		for (const timing of timings) {
			expect(itineraryItemSchema.safeParse({ ...itemBase, timing }).success).toBe(true);
		}
	});

	it('rejects inverted timing bounds and unsupported timing kinds', () => {
		expect(
			itineraryItemSchema.safeParse({
				...itemBase,
				timing: { kind: 'window', earliestAt: 2, latestAt: 1 }
			}).success
		).toBe(false);
		expect(
			itinerarySchema.safeParse({
				title: 'Sample itinerary',
				timeZone: 'UTC',
				items: [{ ...itemBase, timing: { kind: 'unscheduled' } }]
			}).success
		).toBe(false);
	});
});

describe('transport stop schema', () => {
	it('requires one stop for each location and rejects duplicate stops', () => {
		expect(
			itineraryItemSchema.safeParse({
				...transportItem,
				transport: {
					...transportItem.transport,
					stops: [{ locationId: 'departure' }, { locationId: 'departure' }]
				}
			}).success
		).toBe(false);

		expect(
			itinerarySchema.safeParse({
				items: [
					{
						...transportItem,
						transport: {
							...transportItem.transport,
							stops: [{ locationId: 'departure' }]
						}
					}
				],
				timeZone: 'UTC',
				title: 'Sample itinerary'
			}).success
		).toBe(false);
	});
});

describe('cost schemas', () => {
	it('accepts paid cost drafts but requires the server-created payment snapshot in stored items', () => {
		const paidCost = {
			amountMinor: 12_500,
			currency: 'USD',
			scheduledPaymentDate: '2026-04-04',
			status: 'paid'
		} as const;
		const item = { ...itemBase, cost: paidCost, timing: { kind: 'exact' as const, startAt: 1_775_952_000_000 } };

		expect(itineraryItemDraftSchema.safeParse(item).success).toBe(true);
		expect(itineraryItemSchema.safeParse(item).success).toBe(false);
		expect(
			itineraryItemSchema.safeParse({
				...item,
				cost: {
					...paidCost,
					payment: {
						exchangeRate: 1.2,
						localAmountMinor: 15_000,
						localCurrency: 'AUD',
						paidAt: 1_775_952_000_000,
						rateDate: '2026-04-03'
					}
				}
			}).success
		).toBe(true);
	});
});

describe('expense schemas', () => {
	it('defaults expense availability and requires unique IDs and paid dates', () => {
		const itinerary = {
			items: [],
			timeZone: 'UTC',
			title: 'Expense test'
		};
		expect(itinerarySchema.parse(itinerary).expenses).toEqual([]);
		expect(
			itinerarySchema.parse({
				...itinerary,
				expenses: [
					{
						amountMinor: 1_250,
						category: 'food',
						currency: 'AUD',
						id: 'food-one',
						status: 'unpaid',
						title: 'Food'
					}
				]
			}).expenses[0]?.availableForItemCosts
		).toBe(false);
		expect(
			itinerarySchema.safeParse({
				...itinerary,
				expenses: [
					{
						amountMinor: 1_250,
						category: 'food',
						currency: 'AUD',
						id: 'food-one',
						status: 'paid',
						title: 'Food'
					}
				]
			}).success
		).toBe(false);
		expect(
			itinerarySchema.safeParse({
				...itinerary,
				expenses: [
					{
						amountMinor: 1_250,
						category: 'food',
						currency: 'AUD',
						id: 'food-one',
						status: 'unpaid',
						title: 'Food'
					},
					{
						amountMinor: 500,
						category: 'misc',
						currency: 'AUD',
						id: 'food-one',
						status: 'unpaid',
						title: 'Miscellaneous'
					}
				]
			}).success
		).toBe(false);
	});

	it('requires linked expenses to exist and occur only once per item', () => {
		const itinerary = {
			expenses: [
				{
					amountMinor: 45_000,
					availableForItemCosts: true,
					category: 'transport',
					currency: 'AUD',
					id: 'rail-pass',
					status: 'unpaid',
					title: 'Rail pass'
				}
			],
			items: [
				{
					...itemBase,
					linkedExpenseIds: ['rail-pass'],
					timing: { kind: 'exact', startAt: 1_775_952_000_000 }
				}
			],
			timeZone: 'UTC',
			title: 'Linked expenses'
		};
		expect(itinerarySchema.safeParse(itinerary).success).toBe(true);
		expect(
			itinerarySchema.safeParse({
				...itinerary,
				items: [{ ...itinerary.items[0], linkedExpenseIds: ['rail-pass', 'rail-pass'] }]
			}).success
		).toBe(false);
		expect(
			itinerarySchema.safeParse({
				...itinerary,
				items: [{ ...itinerary.items[0], linkedExpenseIds: ['missing-expense'] }]
			}).success
		).toBe(false);
	});
});

describe('planning note schemas', () => {
	it('defaults notes and validates unique day entries with independent estimates', () => {
		const itinerary = {
			items: [],
			timeZone: 'Asia/Tokyo',
			title: 'Note test'
		};
		expect(itinerarySchema.parse(itinerary).notes).toEqual([]);

		const dayNote = {
			date: '2026-04-03',
			entries: [
				{
					estimatedCosts: [{ amountMinor: 3_000, currency: 'JPY', id: 'museum-ticket' }],
					id: 'museum',
					links: [{ label: 'Museum details', url: 'https://example.com/museum' }],
					state: 'idea',
					startTime: '10:00',
					title: 'Museum option'
				}
			],
			kind: 'day',
			text: 'Possible alternatives.',
			timeZone: 'Asia/Tokyo'
		};
		expect(itinerarySchema.safeParse({ ...itinerary, notes: [dayNote] }).success).toBe(true);
		expect(
			itinerarySchema.safeParse({
				...itinerary,
				notes: [
					{
						...dayNote,
						entries: [{ ...dayNote.entries[0], links: [{ label: 'Museum details', url: 'not a URL' }] }]
					}
				]
			}).success
		).toBe(false);
		expect(itinerarySchema.safeParse({ ...itinerary, notes: [dayNote, dayNote] }).success).toBe(false);
		expect(
			itinerarySchema.safeParse({
				...itinerary,
				notes: [
					{
						...dayNote,
						entries: [{ ...dayNote.entries[0], endTime: '09:00' }]
					}
				]
			}).success
		).toBe(false);
	});
});

describe('OpenRailwayMap URLs', () => {
	it('accepts secure map permalinks for itinerary locations', () => {
		const item = itineraryItemSchema.parse({
			...transportItem,
			locations: [
				{
					id: 'departure',
					name: 'Flinders Street Station',
					openRailwayMapUrl: 'https://www.openrailwaymap.org/?lat=-37.8183&lon=144.9671&zoom=14',
					role: 'departure' as const
				},
				{ id: 'arrival', name: 'Southern Cross Station', role: 'arrival' as const }
			]
		});

		expect(item.locations[0]?.openRailwayMapUrl).toBe(
			'https://www.openrailwaymap.org/?lat=-37.8183&lon=144.9671&zoom=14'
		);
		expect(isOpenRailwayMapUrl('https://openrailwaymap.org/?lat=-37.8183&lon=144.9671')).toBe(true);
	});
});
