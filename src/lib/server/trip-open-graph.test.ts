import { describe, expect, it } from 'vitest';
import { itinerarySchema } from '$lib/itinerary/schema';
import { tripOpenGraphDescription } from './trip-open-graph';

const itinerary = itinerarySchema.parse({
	items: [
		{
			id: 'outbound',
			locations: [
				{ id: 'melbourne', name: 'Melbourne', role: 'departure' },
				{ id: 'hong-kong', name: 'Hong Kong', role: 'arrival' }
			],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 25, 12), timeZone: 'Australia/Melbourne' },
			title: 'Melbourne to Hong Kong',
			transport: {
				mode: 'air',
				stops: [
					{ locationId: 'melbourne', scheduledAt: Date.UTC(2026, 9, 25, 13, 45) },
					{ locationId: 'hong-kong', scheduledAt: Date.UTC(2026, 9, 25, 17, 30), timeZone: 'Asia/Hong_Kong' }
				]
			},
			type: 'transport'
		},
		{
			id: 'return',
			locations: [
				{ id: 'singapore', name: 'Singapore', role: 'departure' },
				{ id: 'melbourne-return', name: 'Melbourne', role: 'arrival' }
			],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 10, 4, 13), timeZone: 'Asia/Singapore' },
			title: 'Singapore to Melbourne',
			transport: {
				mode: 'air',
				stops: [
					{ locationId: 'singapore', scheduledAt: Date.UTC(2026, 10, 4, 13) },
					{
						locationId: 'melbourne-return',
						scheduledAt: Date.UTC(2026, 10, 4, 20, 25),
						timeZone: 'Australia/Melbourne'
					}
				]
			},
			type: 'transport'
		}
	],
	timeZone: 'Australia/Melbourne',
	title: 'Birthday 30'
});

describe('tripOpenGraphDescription', () => {
	it('includes the public schedule duration and its first and last local dates', () => {
		expect(tripOpenGraphDescription({ isPublic: true, itinerary })).toBe(
			'Public trip: 12 days\n25th Oct 2026 AEDT >>> 5th Nov 2026 AEDT'
		);
	});

	it('includes the full uncertainty range of an approximate schedule', () => {
		const approximateItinerary = itinerarySchema.parse({
			items: [
				{
					id: 'approximate-activity',
					timing: { kind: 'approximate', nominalAt: Date.UTC(2026, 0, 1, 0, 30), toleranceMinutes: 60 },
					title: 'Approximate activity',
					type: 'activity'
				}
			],
			timeZone: 'UTC',
			title: 'Approximate trip'
		});

		expect(tripOpenGraphDescription({ isPublic: true, itinerary: approximateItinerary })).toBe(
			'Public trip: 2 days\n31st Dec 2025 UTC >>> 1st Jan 2026 UTC'
		);
	});

	it('does not disclose private trip scheduling details', () => {
		expect(tripOpenGraphDescription({ isPublic: false, itinerary })).toBe('Private trip: sign-in required');
	});
});
