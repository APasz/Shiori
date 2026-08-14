import { describe, expect, it } from 'vitest';
import { getItineraryDateRange, getLocalItineraryDays, groupItemsByLocalDay, partitionDayItems } from './presentation';
import { formatLocalTimestamp, localDateTimeToUnixMilliseconds } from './time';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

function requiredTimestamp(value: string): number {
	const timestamp = localDateTimeToUnixMilliseconds(value);
	if (timestamp === null) {
		throw new Error(`Test datetime ${value} should be valid.`);
	}
	return timestamp;
}

function requiredZonedTimestamp(value: string, timeZone: string): number {
	const timestamp = zonedDateTimeToUnixMilliseconds(value, timeZone);
	if (timestamp === null) {
		throw new Error(`Test datetime ${value} should be valid in ${timeZone}.`);
	}
	return timestamp;
}

describe('browser-local itinerary presentation', () => {
	it('places ongoing stays above a day, check-ins below it, and known boundaries in chronological order', () => {
		const date = '2026-04-12';
		const timeZone = 'Australia/Melbourne';
		const at = (time: string): number => requiredZonedTimestamp(`${date}T${time}`, timeZone);
		const onPreviousDay = (time: string): number => requiredZonedTimestamp(`2026-04-11T${time}`, timeZone);
		const transport = {
			id: 'flight',
			timing: { kind: 'exact' as const, startAt: at('21:55') },
			type: 'transport' as const
		};
		const ongoingStay = {
			id: 'homy-hotel',
			timing: { endAt: at('14:00'), kind: 'exact' as const, startAt: onPreviousDay('15:00') },
			type: 'accommodation' as const
		};
		const activity = {
			id: 'museum',
			timing: { kind: 'exact' as const, startAt: at('12:15') },
			type: 'activity' as const
		};
		const arrivingStay = {
			id: 'hanbana-so',
			timing: { endAt: at('23:00'), kind: 'exact' as const, startAt: at('18:00') },
			type: 'accommodation' as const
		};
		const dateOnlyArrivingStay = {
			id: 'unknown-times-hotel',
			timing: { endAt: at('23:59'), kind: 'exact' as const, startAt: at('00:00'), timePrecision: 'date' as const },
			type: 'accommodation' as const
		};

		expect(
			partitionDayItems([ongoingStay, activity, transport, arrivingStay, dateOnlyArrivingStay], date, timeZone)
		).toEqual({
			arrivingStays: [arrivingStay, dateOnlyArrivingStay],
			ongoingStays: [ongoingStay],
			timelineEntries: [
				{ item: activity, kind: 'item', timestamp: at('12:15') },
				{ boundary: 'check-out', item: ongoingStay, kind: 'stay-boundary', timestamp: at('14:00') },
				{ boundary: 'check-in', item: arrivingStay, kind: 'stay-boundary', timestamp: at('18:00') },
				{ item: transport, kind: 'item', timestamp: at('21:55') },
				{ boundary: 'check-out', item: arrivingStay, kind: 'stay-boundary', timestamp: at('23:00') }
			]
		});
	});

	it('keeps a date-only stay above a day after its check-in date', () => {
		const date = '2026-04-12';
		const timeZone = 'Australia/Melbourne';
		const ongoingDateOnlyStay = {
			id: 'unknown-times-hotel',
			timing: {
				endAt: requiredZonedTimestamp('2026-04-13T23:59', timeZone),
				kind: 'exact' as const,
				startAt: requiredZonedTimestamp('2026-04-11T00:00', timeZone),
				timePrecision: 'date' as const
			},
			type: 'accommodation' as const
		};

		expect(partitionDayItems([ongoingDateOnlyStay], date, timeZone)).toEqual({
			arrivingStays: [],
			ongoingStays: [ongoingDateOnlyStay],
			timelineEntries: []
		});
	});

	it('groups exact, approximate, and window timings on every local day they cover', () => {
		const morning = requiredTimestamp('2026-04-12T09:00');
		const afternoon = requiredTimestamp('2026-04-12T14:00');
		const nextMorning = requiredTimestamp('2026-04-13T09:00');
		const checkout = requiredTimestamp('2026-04-13T13:00');
		const firstDay = formatLocalTimestamp(morning);
		const secondDay = formatLocalTimestamp(nextMorning);
		if (!firstDay || !secondDay) {
			throw new Error('Test timestamps should be formatable.');
		}
		const items = [
			{
				id: 'next',
				timing: {
					kind: 'window' as const,
					earliestAt: nextMorning,
					latestAt: nextMorning + 3_600_000
				}
			},
			{
				id: 'overnight',
				timing: { kind: 'exact' as const, startAt: afternoon + 3 * 3_600_000, endAt: checkout }
			},
			{
				id: 'second',
				timing: { kind: 'approximate' as const, nominalAt: afternoon, toleranceMinutes: 30 }
			},
			{ id: 'first', timing: { kind: 'exact' as const, startAt: morning } }
		];

		expect(getItineraryDateRange(items)).toEqual([firstDay.date, secondDay.date]);
		expect(groupItemsByLocalDay(items)).toEqual([
			{
				date: firstDay.date,
				items: [items[3], items[2], items[1]]
			},
			{
				date: secondDay.date,
				items: [items[0], items[1]]
			}
		]);
	});

	it('includes empty calendar days between itinerary items', () => {
		const departure = requiredTimestamp('2026-04-12T09:00');
		const returnFlight = requiredTimestamp('2026-04-20T09:00');
		const items = [
			{ id: 'return', timing: { kind: 'exact' as const, startAt: returnFlight } },
			{ id: 'departure', timing: { kind: 'exact' as const, startAt: departure } }
		];

		expect(getLocalItineraryDays(items)).toEqual([
			{ date: '2026-04-12', items: [items[1]] },
			{ date: '2026-04-13', items: [] },
			{ date: '2026-04-14', items: [] },
			{ date: '2026-04-15', items: [] },
			{ date: '2026-04-16', items: [] },
			{ date: '2026-04-17', items: [] },
			{ date: '2026-04-18', items: [] },
			{ date: '2026-04-19', items: [] },
			{ date: '2026-04-20', items: [items[0]] }
		]);
	});
});
