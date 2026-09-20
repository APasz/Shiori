import { describe, expect, it } from 'vitest';
import { itineraryItemSchema } from './schema';
import { itemLocationFlow, transportTravelDuration } from './item-location-flow';

describe('item location flow', () => {
	it('uses each transport location once in stop order with its service time', () => {
		const item = itineraryItemSchema.parse({
			id: 'journey',
			locations: [
				{ id: 'arrival', name: 'Arrival', role: 'arrival' },
				{ id: 'departure', name: 'Departure', role: 'departure' }
			],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 27, 9), timeZone: 'Asia/Tokyo' },
			title: 'Journey',
			transport: {
				mode: 'rail',
				stops: [
					{ locationId: 'departure', scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' },
					{ locationId: 'arrival', platform: '4', scheduledAt: Date.UTC(2026, 9, 27, 12), timeZone: 'Asia/Seoul' }
				]
			},
			type: 'transport'
		});

		expect(itemLocationFlow(item, 'Australia/Melbourne')).toEqual([
			{
				kind: 'transport-stop',
				location: item.locations[1],
				service: {
					at: Date.UTC(2026, 9, 27, 10),
					locationId: 'departure',
					role: 'departure',
					source: 'service',
					timeZone: 'Asia/Tokyo'
				}
			},
			{
				kind: 'transport-stop',
				location: item.locations[0],
				platform: '4',
				service: {
					at: Date.UTC(2026, 9, 27, 12),
					locationId: 'arrival',
					role: 'arrival',
					source: 'service',
					timeZone: 'Asia/Seoul'
				}
			}
		]);
	});

	it('keeps ordinary locations in their saved order', () => {
		const item = itineraryItemSchema.parse({
			id: 'activity',
			locations: [
				{ id: 'meeting', name: 'Meeting point', role: 'meeting-point' },
				{ id: 'venue', name: 'Venue', role: 'primary' }
			],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 27, 9) },
			title: 'Activity',
			type: 'activity'
		});

		expect(itemLocationFlow(item, 'Australia/Melbourne')).toEqual([
			{ kind: 'location', location: item.locations[0] },
			{ kind: 'location', location: item.locations[1] }
		]);
	});

	it('shows an explicit first-stop service time even when it matches the Plan start', () => {
		const item = itineraryItemSchema.parse({
			id: 'journey',
			locations: [
				{ id: 'departure', name: 'Departure', role: 'departure' },
				{ id: 'arrival', name: 'Arrival', role: 'arrival' }
			],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' },
			title: 'Journey',
			transport: {
				mode: 'rail',
				stops: [
					{ locationId: 'departure', scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' },
					{ locationId: 'arrival', scheduledAt: Date.UTC(2026, 9, 27, 12), timeZone: 'Asia/Seoul' }
				]
			},
			type: 'transport'
		});
		const entries = itemLocationFlow(item, 'Australia/Melbourne');
		const departure = entries[0];
		const arrival = entries[1];

		expect(departure?.kind).toBe('transport-stop');
		expect(arrival?.kind).toBe('transport-stop');
		if (departure?.kind !== 'transport-stop' || arrival?.kind !== 'transport-stop') {
			throw new Error('A transport journey must expose transport-stop location flow entries.');
		}
		expect(departure.service).toMatchObject({ at: Date.UTC(2026, 9, 27, 10), source: 'service' });
		expect(arrival.service).toMatchObject({ at: Date.UTC(2026, 9, 27, 12), source: 'service' });
	});

	it('does not turn an untimed first stop into a service source from the Plan', () => {
		const item = itineraryItemSchema.parse({
			id: 'journey',
			locations: [{ id: 'departure', name: 'Departure', role: 'departure' }],
			timing: { kind: 'exact', startAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' },
			title: 'Journey',
			transport: { mode: 'rail', stops: [{ locationId: 'departure' }] },
			type: 'transport'
		});

		const [departure] = itemLocationFlow(item, 'Australia/Melbourne');

		if (departure?.kind !== 'transport-stop') {
			throw new Error('A transport journey must expose its departure stop.');
		}
		expect(departure.service).toBeUndefined();
	});

	it('uses a day placement zone for explicit transport-stop times without inventing a journey Plan', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'counter-cutoff',
					timing: { at: Date.UTC(2026, 9, 27, 8), kind: 'until', timeZone: 'Asia/Tokyo' },
					type: 'cutoff'
				}
			],
			id: 'journey',
			locations: [{ id: 'departure', name: 'Departure', role: 'departure' }],
			placement: { anchorAt: Date.UTC(2026, 9, 27, 3), timeZone: 'Asia/Tokyo' },
			title: 'Journey',
			transport: {
				mode: 'rail',
				stops: [{ locationId: 'departure', scheduledAt: Date.UTC(2026, 9, 27, 8) }]
			},
			type: 'transport'
		});

		const [departure] = itemLocationFlow(item, 'Australia/Melbourne');

		expect(departure).toMatchObject({
			service: {
				at: Date.UTC(2026, 9, 27, 8),
				source: 'service',
				timeZone: 'Asia/Tokyo'
			}
		});
		if (departure?.kind !== 'transport-stop') {
			throw new Error('A transport journey must expose its departure stop.');
		}
		expect(departure.service?.source).toBe('service');
	});

	it('calculates travel time only between consecutive stops with service times', () => {
		const departure = {
			kind: 'transport-stop' as const,
			location: { id: 'departure', name: 'Departure', role: 'departure' as const },
			service: {
				at: Date.UTC(2026, 9, 27, 10),
				locationId: 'departure',
				role: 'departure' as const,
				source: 'service' as const,
				timeZone: 'Asia/Tokyo'
			}
		};
		const arrival = {
			kind: 'transport-stop' as const,
			location: { id: 'arrival', name: 'Arrival', role: 'arrival' as const },
			service: {
				at: Date.UTC(2026, 9, 27, 12, 30),
				locationId: 'arrival',
				role: 'arrival' as const,
				source: 'service' as const,
				timeZone: 'Asia/Tokyo'
			}
		};

		expect(transportTravelDuration(departure, arrival)).toBe('2h 30m');
		expect(transportTravelDuration({ ...departure, service: undefined }, arrival)).toBeUndefined();
	});
});
