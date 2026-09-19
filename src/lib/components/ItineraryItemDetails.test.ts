import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { FormatPreferences } from '$lib/format-preferences';
import { itineraryItemSchema, type ItineraryItem } from '$lib/itinerary/schema';
import ItineraryItemDetails from './ItineraryItemDetails.svelte';

function renderDetails(item: ItineraryItem, canEdit = false, formatPreferences?: FormatPreferences): string {
	return render(ItineraryItemDetails, {
		context: formatPreferences ? new Map([['__request__', { page: { data: { formatPreferences } } }]]) : undefined,
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
	it('shows a day-anchored availability-only item without presenting an invented schedule time', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'museum-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 12, 7),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 12, 1),
						timeZone: 'Asia/Tokyo'
					},
					type: 'opening-hours'
				}
			],
			id: 'museum',
			placement: { anchorAt: Date.UTC(2026, 3, 12, 3), timeZone: 'Asia/Tokyo' },
			title: 'Museum',
			type: 'activity'
		});

		const html = renderDetails(item);

		expect(html).toContain('Schedule');
		expect(html).toContain('>Day<');
		expect(html).toContain('Time not set');
		expect(html).toContain('Availability');
		expect(html).toContain('Opening');
	});

	it('keeps non-opening availability in item details without turning it into a schedule', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'reception-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 12, 7),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 12, 1),
						timeZone: 'Asia/Tokyo'
					},
					type: 'reception-hours'
				}
			],
			id: 'hotel',
			placement: { anchorAt: Date.UTC(2026, 3, 12, 3), timeZone: 'Asia/Tokyo' },
			title: 'Hotel',
			type: 'activity'
		});

		const html = renderDetails(item);

		expect(html).toContain('Time not set');
		expect(html).toContain('Availability');
		expect(html).toContain('Reception');
	});

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
		expect(html).not.toContain('availability-heading');
	});

	it('shows published property times as availability while retaining a date-only stay', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'property-check-in',
					timing: { at: Date.UTC(2026, 9, 29, 6), kind: 'deadline', timeZone: 'Asia/Tokyo' },
					type: 'check-in'
				},
				{
					id: 'property-check-out',
					timing: { at: Date.UTC(2026, 10, 1, 1), kind: 'deadline', timeZone: 'Asia/Tokyo' },
					type: 'check-out'
				}
			],
			id: 'hotel-yokohama-camelot-japan',
			timing: {
				endAt: Date.UTC(2026, 10, 1, 14, 59),
				kind: 'exact',
				startAt: Date.UTC(2026, 9, 28, 15),
				timePrecision: 'date',
				timeZone: 'Asia/Tokyo'
			},
			title: 'Hotel Yokohama Camelot Japan',
			type: 'accommodation'
		});

		const html = renderDetails(item, false, { dateFormat: 'year-month-day', timeFormat: 'twelve-hour' });

		expect(html).toContain('Check-in');
		expect(html).toContain('Check-out');
		expect(html).toContain('Availability');
		expect(html).toContain('3:00 pm');
		expect(html).toContain('10:00 am');
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
			timing: {
				kind: 'exact',
				startAt: Date.UTC(2026, 9, 26, 0, 45),
				endAt: Date.UTC(2026, 9, 26, 3, 15),
				timeZone: 'Australia/Melbourne'
			},
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
		expect(html).not.toContain('>End');
		expect(html).not.toContain('>Scheduled');
		expect(html).toContain('Travel time: 2h 30m');
		expect(occurrences(html, 'Localizing…')).toBe(3);
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
		expect(convertedHtml).toContain('Rate on 2026-08-12');
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
		expect(html).toContain('Due 2026-10-26');
		expect(html).toContain('Mark cost paid');
	});

	it('uses saved display formats during server rendering', () => {
		const item = itineraryItemSchema.parse({
			id: 'formatted-cost',
			cost: { amountMinor: 56_700, currency: 'HKD', scheduledPaymentDate: '2026-10-26', status: 'unpaid' },
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 26, 9) },
			title: 'Hotel booking',
			type: 'accommodation'
		});

		const html = renderDetails(item, true, { dateFormat: 'day-month-year', timeFormat: 'twelve-hour' });

		expect(html).toContain('Due 26-10-2026');
	});

	it('presents availability separately in each entry’s saved time zone', () => {
		const item = itineraryItemSchema.parse({
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
			title: 'Museum visit',
			type: 'activity'
		});

		const html = renderDetails(item, false, { dateFormat: 'day-month-year', timeFormat: 'twelve-hour' });

		expect(html).toContain('Availability');
		expect(occurrences(html, 'Opening')).toBe(2);
		expect(html).toContain('10:00 am–12:00 pm');
		expect(html).toContain('1:00 pm–4:00 pm');
		expect(html).toContain('Last admission');
		expect(html).toContain('12-04-2026, 3:30 pm');
		expect(html).toContain('PDT');
	});
});
