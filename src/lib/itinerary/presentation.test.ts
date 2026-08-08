import { describe, expect, it } from 'vitest';
import { getItineraryDateRange, getLocalItineraryDays, groupItemsByLocalDay } from './presentation';
import { formatLocalTimestamp, localDateTimeToUnixMilliseconds } from './time';

function requiredTimestamp(value: string): number {
	const timestamp = localDateTimeToUnixMilliseconds(value);
	if (timestamp === null) {
		throw new Error(`Test datetime ${value} should be valid.`);
	}
	return timestamp;
}

describe('browser-local itinerary presentation', () => {
	it('groups exact, approximate, and window timings by their local start date', () => {
		const morning = requiredTimestamp('2026-04-12T09:00');
		const afternoon = requiredTimestamp('2026-04-12T14:00');
		const nextMorning = requiredTimestamp('2026-04-13T09:00');
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
				id: 'second',
				timing: { kind: 'approximate' as const, nominalAt: afternoon, toleranceMinutes: 30 }
			},
			{ id: 'first', timing: { kind: 'exact' as const, startAt: morning } }
		];

		expect(getItineraryDateRange(items)).toEqual([firstDay.date, secondDay.date]);
		expect(groupItemsByLocalDay(items)).toEqual([
			{
				date: firstDay.date,
				items: [items[2], items[1]]
			},
			{
				date: secondDay.date,
				items: [items[0]]
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
