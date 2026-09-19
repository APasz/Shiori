import { describe, expect, it } from 'vitest';
import { getNowNextState } from './now-next';
import type { Constraint, ItineraryTiming } from './schema';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

const day = 86_400_000;
const now = Date.UTC(2026, 3, 12, 12, 0);
const tripTimeZone = 'UTC';

type TestItem = Readonly<{
	availability?: readonly Constraint[];
	id: string;
	placement?: Readonly<{ anchorAt: number; timeZone: string }>;
	timing?: ItineraryTiming;
	type: 'accommodation' | 'activity';
}>;

function exactItem(id: string, startAt: number, endAt?: number): TestItem {
	return {
		id,
		timing: { kind: 'exact', startAt, ...(endAt === undefined ? {} : { endAt }) },
		type: 'activity'
	};
}

function accommodationItem(id: string, startAt: number, endAt?: number, timeZone?: string): TestItem {
	return {
		id,
		timing: {
			kind: 'exact',
			startAt,
			...(endAt === undefined ? {} : { endAt }),
			...(timeZone === undefined ? {} : { timeZone })
		},
		type: 'accommodation'
	};
}

function availabilityPeriod(id: string, startAt: number, endAt: number): Constraint {
	return {
		id,
		timing: { endAt, kind: 'period', startAt, timeZone: tripTimeZone },
		type: 'opening-hours'
	};
}

function availabilityDeadline(id: string, at: number): Constraint {
	return {
		id,
		timing: { at, kind: 'deadline', timeZone: tripTimeZone },
		type: 'cutoff'
	};
}

function timestampIn(timeZone: string, localDateTime: string): number {
	const timestamp = zonedDateTimeToUnixMilliseconds(localDateTime, timeZone);
	if (timestamp === null) {
		throw new Error(`Cannot determine ${localDateTime} in ${timeZone}.`);
	}
	return timestamp;
}

function nowNext(items: TestItem[], currentTimestamp = now, timeZone = tripTimeZone) {
	return getNowNextState(items, currentTimestamp, timeZone);
}

describe('Now / Next presentation', () => {
	it('shows an hourly countdown and the first item before the trip', () => {
		const firstItem = exactItem('departure', now + 81 * day);

		expect(nowNext([firstItem])).toEqual({
			kind: 'before-trip',
			hoursUntilStart: 1_944,
			nextItem: firstItem
		});
	});

	it('shows only the next item after an earlier item has completed', () => {
		const previousItem = exactItem('breakfast', now - day);
		const nextItem = exactItem('museum', now + day);

		expect(nowNext([nextItem, previousItem])).toEqual({
			kind: 'next-only',
			nextItem
		});
	});

	it('drops a time window after it has passed', () => {
		const previousItem: TestItem = {
			id: 'market',
			timing: { kind: 'window', earliestAt: now - 2 * 60 * 60_000, latestAt: now - 60 * 60_000 },
			type: 'activity'
		};
		const nextItem = exactItem('dinner', now + 60 * 60_000);

		expect(nowNext([previousItem, nextItem])).toEqual({
			kind: 'next-only',
			nextItem
		});
	});

	it('shows a definite exact item as current with its following item', () => {
		const currentItem = exactItem('flight', now - 30 * 60_000, now + 30 * 60_000);
		const nextItem = exactItem('hotel', now + day);

		expect(nowNext([nextItem, currentItem])).toEqual({
			kind: 'exact-current',
			currentItem,
			nextItem
		});
	});

	it('calls out an approximate item around its nominal time without calling it current', () => {
		const approximateItem: TestItem = {
			id: 'tour',
			timing: { kind: 'approximate', nominalAt: now, toleranceMinutes: 30 },
			type: 'activity'
		};

		expect(nowNext([approximateItem])).toEqual({
			kind: 'approximate-now',
			approximateItem
		});
	});

	it('keeps possibly active approximate Schedules in chronological order', () => {
		const earlierItem: TestItem = {
			id: 'earlier-tour',
			timing: { kind: 'approximate', nominalAt: now - 10 * 60_000, toleranceMinutes: 30 },
			type: 'activity'
		};
		const laterItem: TestItem = {
			id: 'later-tour',
			timing: { kind: 'approximate', nominalAt: now + 10 * 60_000, toleranceMinutes: 30 },
			type: 'activity'
		};

		expect(nowNext([laterItem, earlierItem])).toEqual({
			approximateItem: earlierItem,
			kind: 'approximate-now',
			nextItem: laterItem
		});
	});

	it('identifies an active time window', () => {
		const currentItem: TestItem = {
			id: 'check-in',
			timing: { kind: 'window', earliestAt: now - 30 * 60_000, latestAt: now + 30 * 60_000 },
			type: 'activity'
		};
		const nextItem = exactItem('dinner', now + day);

		expect(nowNext([nextItem, currentItem])).toEqual({
			kind: 'window-active',
			currentItem,
			nextItem
		});
	});

	it('does not label items earlier in an active window as next', () => {
		const currentItem: TestItem = {
			id: 'open-air-market',
			timing: { kind: 'window', earliestAt: now - 3 * 60 * 60_000, latestAt: now + 3 * 60 * 60_000 },
			type: 'activity'
		};
		const completedItem = exactItem('morning-tour', now - 30 * 60_000);
		const nextItem = exactItem('dinner', now + 30 * 60_000);

		expect(nowNext([nextItem, completedItem, currentItem])).toEqual({
			kind: 'window-active',
			currentItem,
			nextItem
		});
	});

	it('limits a multi-day stay to check-in and check-out windows in its destination time zone', () => {
		const timeZone = 'Asia/Tokyo';
		const hotel = accommodationItem(
			'hotel',
			timestampIn(timeZone, '2026-04-12T16:00'),
			timestampIn(timeZone, '2026-04-15T10:00'),
			timeZone
		);

		expect(nowNext([hotel], timestampIn(timeZone, '2026-04-12T21:00'))).toEqual({
			kind: 'exact-current',
			currentItem: hotel,
			currentBoundary: 'check-in'
		});
		expect(nowNext([hotel], timestampIn(timeZone, '2026-04-13T12:00'))).toEqual({
			kind: 'idle'
		});
		expect(nowNext([hotel], timestampIn(timeZone, '2026-04-15T09:00'))).toEqual({
			kind: 'exact-current',
			currentItem: hotel,
			currentBoundary: 'check-out'
		});
	});

	it('treats an uncertain accommodation time as a check-in window', () => {
		const hotel: TestItem = {
			id: 'hotel',
			timing: { kind: 'window', earliestAt: now - 30 * 60_000, latestAt: now + 30 * 60_000 },
			type: 'accommodation'
		};

		expect(nowNext([hotel])).toEqual({
			kind: 'window-active',
			currentItem: hotel,
			currentBoundary: 'check-in'
		});
	});

	it('treats a same-day stay as separate check-in and check-out events', () => {
		const hotel = accommodationItem('day-room', now - 2 * 60 * 60_000, now + 3 * 60 * 60_000);

		expect(nowNext([hotel])).toEqual({
			kind: 'next-only',
			nextItem: hotel,
			nextBoundary: 'check-out'
		});
	});

	it('uses only a check-in window for an open-ended stay', () => {
		const hotel = accommodationItem('open-stay', now - 60 * 60_000);

		expect(nowNext([hotel])).toEqual({
			kind: 'exact-current',
			currentItem: hotel,
			currentBoundary: 'check-in'
		});
	});

	it('shows completion after the final timing has ended', () => {
		expect(nowNext([exactItem('return', now - day)])).toEqual({
			kind: 'complete'
		});
	});

	it('shows the active then next chronological availability constraint for day-anchored items', () => {
		const morningHours = availabilityPeriod('morning-hours', now - 2 * 60 * 60_000, now + 30 * 60_000);
		const afternoonHours = availabilityPeriod('afternoon-hours', now + 60 * 60_000, now + 3 * 60 * 60_000);
		const availabilityOnly: TestItem = {
			availability: [afternoonHours, morningHours],
			id: 'museum',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};

		expect(nowNext([availabilityOnly])).toEqual({
			currentAvailability: morningHours,
			currentItem: availabilityOnly,
			kind: 'window-active',
			nextAvailability: afternoonHours,
			nextItem: availabilityOnly
		});
		expect(nowNext([availabilityOnly], now + 45 * 60_000)).toEqual({
			kind: 'next-only',
			nextAvailability: afternoonHours,
			nextItem: availabilityOnly
		});
		expect(nowNext([availabilityOnly], now + 4 * 60 * 60_000)).toEqual({ kind: 'availability-complete' });
	});

	it('keeps a current Schedule ahead of active availability', () => {
		const openingHours = availabilityPeriod('opening-hours', now - 60 * 60_000, now + 60 * 60_000);
		const availableItem: TestItem = {
			availability: [openingHours],
			id: 'museum',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};
		const scheduled = exactItem('museum-visit', now - 30 * 60_000, now + 30 * 60_000);

		expect(nowNext([availableItem, scheduled])).toEqual({
			currentItem: scheduled,
			kind: 'exact-current'
		});
	});

	it('uses active availability before a later scheduled item and the nearer opening period as next', () => {
		const openingHours = availabilityPeriod('morning-hours', now - 60 * 60_000, now + 30 * 60_000);
		const afternoonHours = availabilityPeriod('afternoon-hours', now + 60 * 60_000, now + 3 * 60 * 60_000);
		const availableItem: TestItem = {
			availability: [afternoonHours, openingHours],
			id: 'bungo-mori',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};
		const scheduled = exactItem('two-stars', now + day);

		expect(nowNext([scheduled, availableItem])).toEqual({
			currentAvailability: openingHours,
			currentItem: availableItem,
			kind: 'window-active',
			nextAvailability: afternoonHours,
			nextItem: availableItem
		});
	});

	it('uses a nearer upcoming opening period as next before a later Schedule', () => {
		const openingHours = availabilityPeriod('opening-hours', now + 30 * 60_000, now + 2 * 60 * 60_000);
		const availableItem: TestItem = {
			availability: [openingHours],
			id: 'museum',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};
		const scheduled = exactItem('dinner', now + 3 * 60 * 60_000);

		expect(nowNext([scheduled, availableItem])).toEqual({
			kind: 'next-only',
			nextAvailability: openingHours,
			nextItem: availableItem
		});
	});

	it('uses a later Schedule as next after active availability when it is the next candidate', () => {
		const openingHours = availabilityPeriod('opening-hours', now - 60 * 60_000, now + 60 * 60_000);
		const availableItem: TestItem = {
			availability: [openingHours],
			id: 'museum',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};
		const scheduled = exactItem('dinner', now + 3 * 60 * 60_000);

		expect(nowNext([availableItem, scheduled])).toEqual({
			currentAvailability: openingHours,
			currentItem: availableItem,
			kind: 'window-active',
			nextItem: scheduled
		});
	});

	it('chooses the most recently opened overlapping period regardless of input order', () => {
		const earlierHours = availabilityPeriod('earlier-hours', now - 2 * 60 * 60_000, now + 60 * 60_000);
		const laterHours = availabilityPeriod('later-hours', now - 60 * 60_000, now + 60 * 60_000);
		const earlierItem: TestItem = {
			availability: [earlierHours],
			id: 'earlier-museum',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};
		const laterItem: TestItem = {
			availability: [laterHours],
			id: 'later-museum',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};

		expect(nowNext([laterItem, earlierItem])).toEqual({
			currentAvailability: laterHours,
			currentItem: laterItem,
			kind: 'window-active'
		});
	});

	it('does not make availability deadlines into timeline candidates', () => {
		const cutoff = availabilityDeadline('ticket-cutoff', now + 30 * 60_000);
		const lastAdmission: Constraint = {
			id: 'last-admission',
			timing: { at: now + 45 * 60_000, kind: 'deadline', timeZone: tripTimeZone },
			type: 'last-admission'
		};
		const publishedStayTimes: Constraint[] = [
			{
				id: 'property-check-in',
				timing: { at: now + 60 * 60_000, kind: 'deadline', timeZone: tripTimeZone },
				type: 'check-in'
			},
			{
				id: 'property-check-out',
				timing: { at: now + 90 * 60_000, kind: 'deadline', timeZone: tripTimeZone },
				type: 'check-out'
			}
		];
		const ferry: TestItem = {
			availability: [cutoff, lastAdmission, ...publishedStayTimes],
			id: 'ferry',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};

		expect(nowNext([ferry])).toEqual({ kind: 'empty' });
		expect(nowNext([ferry], now + 30 * 60_000)).toEqual({ kind: 'empty' });
		expect(nowNext([ferry], now + 45 * 60_000)).toEqual({ kind: 'empty' });
	});

	it('does not make non-opening availability periods into timeline candidates', () => {
		const nonOpeningPeriods: Constraint[] = (['reception-hours', 'desk-hours', 'storage-hours', 'other'] as const).map(
			(type) => ({
				id: type,
				timing: { endAt: now + 60 * 60_000, kind: 'period', startAt: now - 60 * 60_000, timeZone: tripTimeZone },
				type
			})
		);
		const hotel: TestItem = {
			availability: nonOpeningPeriods,
			id: 'hotel',
			placement: { anchorAt: now, timeZone: tripTimeZone },
			type: 'activity'
		};

		expect(nowNext([hotel])).toEqual({ kind: 'empty' });
	});

	it('handles an empty itinerary', () => {
		expect(nowNext([])).toEqual({ kind: 'empty' });
	});
});
