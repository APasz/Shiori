import { describe, expect, it } from 'vitest';
import { itinerarySchema } from '$lib/itinerary/schema';
import { summarizeExpenses } from './overview';

describe('expense overview', () => {
	it('groups direct and linked costs by category without double-counting linked expenses', () => {
		const itinerary = itinerarySchema.parse({
			expenses: [
				{
					amountMinor: 2_500,
					availableForItemCosts: true,
					category: 'food',
					currency: 'AUD',
					id: 'food-day',
					paidDate: '2026-04-04',
					status: 'paid',
					title: 'Food',
					useDate: '2026-04-04'
				},
				{
					amountMinor: 350,
					availableForItemCosts: false,
					category: 'misc',
					currency: 'AUD',
					id: 'misc-day',
					paidDate: '2026-04-04',
					status: 'paid',
					title: 'Miscellaneous',
					useDate: '2026-04-04'
				}
			],
			items: [
				{
					cost: { amountMinor: 7_000, currency: 'EUR', status: 'unpaid' },
					id: 'train',
					linkedExpenseIds: ['food-day'],
					timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 4) },
					title: 'Train',
					transport: {
						mode: 'rail',
						stops: [{ locationId: 'departure' }, { locationId: 'arrival' }]
					},
					locations: [
						{ id: 'departure', name: 'Departure', role: 'departure' },
						{ id: 'arrival', name: 'Arrival', role: 'arrival' }
					],
					type: 'transport'
				},
				{
					cost: {
						amountMinor: 20_000,
						currency: 'USD',
						payment: {
							exchangeRate: 1.5,
							localAmountMinor: 30_000,
							localCurrency: 'AUD',
							paidAt: Date.UTC(2026, 3, 1),
							rateDate: '2026-04-01'
						},
						status: 'paid'
					},
					id: 'hotel',
					timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 4) },
					title: 'Hotel',
					type: 'accommodation'
				},
				{
					cost: { amountMinor: 1_200, currency: 'AUD', status: 'unpaid' },
					id: 'museum',
					timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 4) },
					title: 'Museum',
					type: 'activity'
				}
			],
			localCurrency: 'AUD',
			timeZone: 'UTC',
			title: 'Expense test'
		});

		expect(summarizeExpenses(itinerary)).toEqual({
			categories: [
				{ category: 'transport', label: 'Transport', paid: [], unpaid: [{ amountMinor: 7_000, currency: 'EUR' }] },
				{
					category: 'accommodation',
					label: 'Accommodation',
					paid: [{ amountMinor: 30_000, currency: 'AUD' }],
					unpaid: []
				},
				{ category: 'activity', label: 'Activities', paid: [], unpaid: [{ amountMinor: 1_200, currency: 'AUD' }] },
				{ category: 'food', label: 'Food', paid: [{ amountMinor: 2_500, currency: 'AUD' }], unpaid: [] },
				{ category: 'misc', label: 'Miscellaneous', paid: [{ amountMinor: 350, currency: 'AUD' }], unpaid: [] },
				{ category: 'other', label: 'Other', paid: [], unpaid: [] }
			],
			paid: [{ amountMinor: 32_850, currency: 'AUD' }],
			unpaid: [
				{ amountMinor: 1_200, currency: 'AUD' },
				{ amountMinor: 7_000, currency: 'EUR' }
			]
		});
	});
});
