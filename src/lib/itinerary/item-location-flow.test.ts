import { describe, expect, it } from 'vitest';
import { itineraryItemSchema } from './schema';
import { itemLocationFlow, shouldShowTransportStopSchedule, transportTravelDuration } from './item-location-flow';

describe('item location flow', () => {
	it('uses each transport location once in stop order with its schedule', () => {
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
				hasScheduledTime: true,
				schedule: { scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' }
			},
			{
				kind: 'transport-stop',
				location: item.locations[0],
				platform: '4',
				hasScheduledTime: true,
				schedule: { scheduledAt: Date.UTC(2026, 9, 27, 12), timeZone: 'Asia/Seoul' }
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

	it('hides a first-stop time that repeats the item start', () => {
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
		expect(shouldShowTransportStopSchedule(departure, 0, item.timing)).toBe(false);
		expect(shouldShowTransportStopSchedule(arrival, 1, item.timing)).toBe(true);
	});

	it('calculates travel time only between consecutive scheduled stops', () => {
		const departure = {
			kind: 'transport-stop' as const,
			location: { id: 'departure', name: 'Departure', role: 'departure' as const },
			hasScheduledTime: true,
			schedule: { scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Tokyo' }
		};
		const arrival = {
			kind: 'transport-stop' as const,
			location: { id: 'arrival', name: 'Arrival', role: 'arrival' as const },
			hasScheduledTime: true,
			schedule: { scheduledAt: Date.UTC(2026, 9, 27, 12, 30), timeZone: 'Asia/Tokyo' }
		};

		expect(transportTravelDuration(departure, arrival)).toBe('2h 30m');
		expect(transportTravelDuration({ ...departure, hasScheduledTime: false }, arrival)).toBeUndefined();
	});
});
