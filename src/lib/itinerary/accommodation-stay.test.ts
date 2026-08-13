import { describe, expect, it } from 'vitest';
import { accommodationStayDraft } from './accommodation-stay';
import { itineraryItemDraftSchema } from './schema';

describe('accommodation stay drafts', () => {
	it('creates a stay with distinct check-in and check-out times', () => {
		const result = accommodationStayDraft({
			address: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan',
			checkInDate: '2026-11-02',
			checkInTime: '15:00',
			checkOutDate: '2026-11-04',
			checkOutTime: '10:00',
			coordinates: { latitude: 34.8627692, longitude: 135.6777082 },
			cost: { amount: '125.50', currency: 'AUD', scheduledPaymentDate: '2026-11-01', status: 'unpaid' },
			googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=ELE+Hotel+Kuzuha',
			id: 'ele-hotel-kuzuha',
			links: [{ label: 'Google Hotels', url: 'https://www.google.com/travel/search' }],
			locationId: 'ele-hotel-kuzuha-location',
			name: 'ELE Hotel 樟葉',
			reservation: { provider: 'Agoda', reference: 'ABC123', status: 'confirmed' },
			timesKnown: true,
			timeZone: 'Asia/Tokyo',
			title: 'ELE Hotel 樟葉'
		});

		expect(result).toMatchObject({
			valid: true,
			item: {
				timing: {
					kind: 'exact',
					startAt: Date.UTC(2026, 10, 2, 6),
					endAt: Date.UTC(2026, 10, 4, 1)
				},
				cost: { amountMinor: 12_550, currency: 'AUD', scheduledPaymentDate: '2026-11-01', status: 'unpaid' },
				reservation: { provider: 'Agoda', reference: 'ABC123', status: 'confirmed' }
			}
		});
		if (result.valid) {
			expect(itineraryItemDraftSchema.parse(result.item)).toEqual(result.item);
		}
	});

	it('rejects a stay whose checkout is not after check-in', () => {
		expect(
			accommodationStayDraft({
				checkInDate: '2026-11-02',
				checkInTime: '15:00',
				checkOutDate: '2026-11-02',
				checkOutTime: '10:00',
				id: 'ele-hotel-kuzuha',
				links: [],
				locationId: 'ele-hotel-kuzuha-location',
				name: 'ELE Hotel 樟葉',
				timesKnown: true,
				timeZone: 'Asia/Tokyo',
				title: 'ELE Hotel 樟葉'
			})
		).toEqual({ error: 'Check-out must be after check-in.', valid: false });
	});

	it('creates a date-only stay when the accommodation times are unknown', () => {
		const result = accommodationStayDraft({
			checkInDate: '2026-10-29',
			checkOutDate: '2026-11-01',
			id: 'hotel-yokohama-camelot-japan',
			links: [],
			locationId: 'hotel-yokohama-camelot-japan-location',
			name: 'Hotel Yokohama Camelot Japan',
			timesKnown: false,
			timeZone: 'Asia/Tokyo',
			title: 'Hotel Yokohama Camelot Japan'
		});

		expect(result).toMatchObject({
			valid: true,
			item: {
				timing: {
					kind: 'exact',
					startAt: Date.UTC(2026, 9, 28, 15),
					endAt: Date.UTC(2026, 10, 1, 14, 59),
					timePrecision: 'date',
					timeZone: 'Asia/Tokyo'
				}
			}
		});
	});
});
