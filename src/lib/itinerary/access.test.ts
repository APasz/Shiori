import { describe, expect, it } from 'vitest';
import { projectDetailedItinerary, projectPublicItinerary } from './access';
import { externalUrlSchema, type Itinerary } from './schema';

const testItinerary = {
	localCurrency: 'AUD' as const,
	title: 'Test itinerary',
	timeZone: 'UTC',
	items: [
		{
			id: 'test-transport',
			timing: { kind: 'exact', startAt: 1_775_952_000_000 },
			title: 'Restricted transport',
			locations: [
				{ id: 'departure', role: 'departure', name: 'Departure' },
				{ id: 'arrival', role: 'arrival', name: 'Arrival' }
			],
			notes: [],
			links: [],
			cost: {
				amountMinor: 12_500,
				currency: 'USD',
				payment: {
					exchangeRate: 1.2,
					localAmountMinor: 15_000,
					localCurrency: 'AUD',
					paidAt: 1_775_952_000_000,
					rateDate: '2026-04-03'
				},
				status: 'paid'
			},
			documents: [
				{
					title: 'Ticket confirmation',
					kind: 'ticket',
					url: 'https://example.com/ticket'
				}
			],
			reservation: { reference: 'TEST-000000', status: 'confirmed' },
			type: 'transport',
			transport: {
				mode: 'rail',
				seat: 'Car 8, Seat 12A',
				stops: [
					{ locationId: 'departure', platform: '20' },
					{ locationId: 'arrival', platform: '12' }
				]
			}
		}
	]
} satisfies Itinerary;

function firstTransport(itinerary: Itinerary = testItinerary) {
	const item = itinerary.items.find((candidate) => candidate.type === 'transport');
	if (!item || item.type !== 'transport') {
		throw new Error('The test itinerary needs a transport item.');
	}
	return item;
}

describe('external itinerary URLs', () => {
	it('allows web URLs but rejects executable URL schemes', () => {
		expect(externalUrlSchema.safeParse('https://example.com/ticket').success).toBe(true);
		expect(externalUrlSchema.safeParse('http://localhost:5173').success).toBe(true);
		expect(externalUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
		expect(externalUrlSchema.safeParse('data:text/html,unsafe').success).toBe(false);
	});
});

describe('itinerary visibility projection', () => {
	it('returns only the public schedule to visitors', () => {
		const publicItinerary = projectPublicItinerary(testItinerary);
		const item = publicItinerary.items[0];

		expect(item).toEqual({
			id: 'test-transport',
			timing: { kind: 'exact', startAt: 1_775_952_000_000 },
			title: 'Restricted transport',
			type: 'transport'
		});
		expect(item).not.toHaveProperty('reservation');
	});

	it('withholds every restricted detail from standard users', () => {
		const transport = firstTransport(projectDetailedItinerary(testItinerary, 'user'));

		expect(transport.documents).toEqual([]);
		expect(transport.reservation).toBeUndefined();
		expect(transport.cost).toBeUndefined();
		expect(transport.transport.seat).toBeUndefined();
		expect(transport.transport.stops.every((stop) => stop.platform === undefined)).toBe(true);
	});

	it('retains restricted details for admins', () => {
		const transport = firstTransport(projectDetailedItinerary(testItinerary, 'admin'));

		expect(transport.documents).toHaveLength(1);
		expect(transport.reservation?.reference).toBe('TEST-000000');
		expect(transport.cost?.status).toBe('paid');
		expect(transport.transport.seat).toBe('Car 8, Seat 12A');
		expect(transport.transport.stops[0]?.platform).toBe('20');
	});
});
