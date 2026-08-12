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
			amount: 12_500,
			currency: 'USD',
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
						localAmount: 15_000,
						localCurrency: 'AUD',
						paidAt: 1_775_952_000_000,
						rateDate: '2026-04-03'
					}
				}
			}).success
		).toBe(true);
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
