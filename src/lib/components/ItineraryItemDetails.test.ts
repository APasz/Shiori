import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { itineraryItemSchema, type ItineraryItem } from '$lib/itinerary/schema';
import ItineraryItemDetails from './ItineraryItemDetails.svelte';

function renderDetails(item: ItineraryItem, canEdit = false): string {
	return render(ItineraryItemDetails, {
		props: {
			item,
			expenses: [],
			localCurrency: 'AUD',
			tripTimeZone: 'Asia/Hong_Kong',
			canEdit,
			mutationError: null,
			isDeleting: false,
			isMarkingCostPaid: false,
			onDelete: () => {},
			onDismiss: () => {},
			onEdit: () => {},
			onMarkCostPaid: () => {}
		}
	}).body;
}

function occurrences(value: string, search: string): number {
	return value.split(search).length - 1;
}

describe('itinerary item details', () => {
	it('uses check-in and check-out without repeating the accommodation time at its location', () => {
		const item = itineraryItemSchema.parse({
			id: 'stay',
			locations: [{ id: 'hotel', name: 'Harbour Hotel', role: 'primary' }],
			timing: {
				kind: 'exact',
				startAt: Date.UTC(2026, 9, 26, 9),
				endAt: Date.UTC(2026, 9, 27, 6),
				timeZone: 'Asia/Hong_Kong'
			},
			title: 'Harbour Hotel',
			type: 'accommodation'
		});

		const html = renderDetails(item);

		expect(html).toContain('Schedule');
		expect(html).toContain('Check-in');
		expect(html).toContain('Check-out');
		expect(html).not.toContain('>At');
	});

	it('keeps activity start and end labels with its location time', () => {
		const item = itineraryItemSchema.parse({
			id: 'activity',
			locations: [{ id: 'venue', name: 'Museum', role: 'primary' }],
			timing: {
				kind: 'exact',
				startAt: Date.UTC(2026, 9, 26, 9),
				endAt: Date.UTC(2026, 9, 26, 11),
				timeZone: 'Asia/Hong_Kong'
			},
			title: 'Museum visit',
			type: 'activity'
		});

		const html = renderDetails(item);

		expect(html).toContain('Schedule');
		expect(html).toContain('Start');
		expect(html).toContain('End');
		expect(html).toContain('>At');
	});

	it('suppresses transport labels and the duplicate first-stop time while retaining travel duration', () => {
		const item = itineraryItemSchema.parse({
			id: 'journey',
			locations: [
				{ id: 'departure', name: 'Melbourne', role: 'departure' },
				{ id: 'arrival', name: 'Hong Kong', role: 'arrival' }
			],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 26, 0, 45), timeZone: 'Australia/Melbourne' },
			title: 'Melbourne to Hong Kong',
			transport: {
				mode: 'air',
				stops: [
					{
						locationId: 'departure',
						scheduledAt: Date.UTC(2026, 9, 26, 0, 45),
						timeZone: 'Australia/Melbourne'
					},
					{
						locationId: 'arrival',
						scheduledAt: Date.UTC(2026, 9, 26, 3, 15),
						timeZone: 'Asia/Hong_Kong'
					}
				]
			},
			type: 'transport'
		});

		const html = renderDetails(item);

		expect(html).not.toContain('>Schedule');
		expect(html).not.toContain('>Start');
		expect(html).not.toContain('>Scheduled');
		expect(html).toContain('Travel time: 2h 30m');
		expect(occurrences(html, 'Localizing…')).toBe(2);
	});

	it('condenses paid costs and shows conversion details only when the currencies differ', () => {
		const sameCurrencyItem = itineraryItemSchema.parse({
			id: 'same-currency-cost',
			cost: {
				amountMinor: 73_000,
				currency: 'AUD',
				status: 'paid',
				payment: {
					exchangeRate: 1,
					localAmountMinor: 73_000,
					localCurrency: 'AUD',
					paidAt: Date.UTC(2026, 7, 13, 0, 15),
					rateDate: '2026-08-12'
				}
			},
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 26, 9) },
			title: 'Airport transfer',
			type: 'activity'
		});
		const sameCurrencyCost = sameCurrencyItem.cost;
		if (!sameCurrencyCost || sameCurrencyCost.status !== 'paid') {
			throw new Error('The test item must have a paid cost.');
		}
		const convertedItem = itineraryItemSchema.parse({
			...sameCurrencyItem,
			id: 'converted-cost',
			cost: {
				...sameCurrencyCost,
				payment: {
					...sameCurrencyCost.payment,
					exchangeRate: 5.2,
					localAmountMinor: 379_600,
					localCurrency: 'HKD'
				}
			}
		});

		const sameCurrencyHtml = renderDetails(sameCurrencyItem);
		const convertedHtml = renderDetails(convertedItem);

		expect(sameCurrencyHtml).toContain('Paid');
		expect(sameCurrencyHtml).not.toContain('≈');
		expect(sameCurrencyHtml).not.toContain('Rate on');
		expect(convertedHtml).toContain('≈');
		expect(convertedHtml).toContain('Rate on 12 Aug 2026');
		expect(convertedHtml).toMatch(/1 AUD = 5\.2\s+HKD/);
	});

	it('expresses an unpaid scheduled payment as a due date', () => {
		const item = itineraryItemSchema.parse({
			id: 'unpaid-cost',
			cost: { amountMinor: 56_700, currency: 'HKD', scheduledPaymentDate: '2026-10-26', status: 'unpaid' },
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 26, 9) },
			title: 'Hotel booking',
			type: 'accommodation'
		});

		const html = renderDetails(item, true);

		expect(html).toContain('Scheduled');
		expect(html).toContain('Due 26 Oct 2026');
		expect(html).toContain('Mark cost paid');
	});
});
