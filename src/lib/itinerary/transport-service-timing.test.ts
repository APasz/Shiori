import { describe, expect, it } from 'vitest';
import {
	firstScheduledTransportServiceTime,
	lastScheduledTransportServiceTime,
	resolveTransportServiceTimes,
	transportServiceTimeLabel,
	transportServiceTimeRoleForStop
} from './transport-service-timing';

describe('transport service timing', () => {
	it('derives factual service times with explicit journey roles and locations', () => {
		const serviceTimes = resolveTransportServiceTimes(
			{
				stops: [
					{ locationId: 'departure', scheduledAt: Date.UTC(2026, 9, 27, 10) },
					{ locationId: 'via', scheduledAt: Date.UTC(2026, 9, 27, 11), timeZone: 'Asia/Seoul' },
					{ locationId: 'arrival', scheduledAt: Date.UTC(2026, 9, 27, 12) }
				]
			},
			'Asia/Tokyo'
		);

		expect(serviceTimes).toEqual([
			{
				at: Date.UTC(2026, 9, 27, 10),
				locationId: 'departure',
				role: 'departure',
				source: 'service',
				timeZone: 'Asia/Tokyo'
			},
			{
				at: Date.UTC(2026, 9, 27, 11),
				locationId: 'via',
				role: 'via',
				source: 'service',
				timeZone: 'Asia/Seoul'
			},
			{
				at: Date.UTC(2026, 9, 27, 12),
				locationId: 'arrival',
				role: 'arrival',
				source: 'service',
				timeZone: 'Asia/Tokyo'
			}
		]);
		expect(firstScheduledTransportServiceTime(serviceTimes)).toBe(serviceTimes[0]);
		expect(lastScheduledTransportServiceTime(serviceTimes)).toBe(serviceTimes[2]);
	});

	it('selects the first and last scheduled facts even when endpoint stops are untimed', () => {
		const serviceTimes = resolveTransportServiceTimes(
			{
				stops: [
					{ locationId: 'departure' },
					{ locationId: 'via', scheduledAt: Date.UTC(2026, 9, 27, 11) },
					{ locationId: 'arrival', scheduledAt: Date.UTC(2026, 9, 27, 12) }
				]
			},
			'UTC'
		);

		expect(firstScheduledTransportServiceTime(serviceTimes)).toMatchObject({ locationId: 'via', role: 'via' });
		expect(lastScheduledTransportServiceTime(serviceTimes)).toMatchObject({ locationId: 'arrival', role: 'arrival' });
	});

	it('keeps a Unix-epoch stop as an explicit service time', () => {
		expect(resolveTransportServiceTimes({ stops: [{ locationId: 'origin', scheduledAt: 0 }] }, 'UTC')).toEqual([
			{
				at: 0,
				locationId: 'origin',
				role: 'departure',
				source: 'service',
				timeZone: 'UTC'
			}
		]);
	});

	it('centralises stop roles and factual display labels', () => {
		expect(transportServiceTimeRoleForStop(0, 1)).toBe('departure');
		expect(transportServiceTimeRoleForStop(0, 3)).toBe('departure');
		expect(transportServiceTimeRoleForStop(1, 3)).toBe('via');
		expect(transportServiceTimeRoleForStop(2, 3)).toBe('arrival');
		expect(transportServiceTimeLabel('departure')).toBe('Scheduled departure');
		expect(transportServiceTimeLabel('arrival')).toBe('Scheduled arrival');
		expect(transportServiceTimeLabel('via')).toBe('Scheduled stop');
	});
});
