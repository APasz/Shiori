import { describe, expect, it } from 'vitest';
import { getNowNextState } from './now-next';
import type { ItineraryTiming } from './schema';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

const day = 86_400_000;
const now = Date.UTC(2026, 3, 12, 12, 0);
const tripTimeZone = 'UTC';

type TestItem = Readonly<{
	id: string;
	timing: ItineraryTiming;
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

	it('handles an empty itinerary', () => {
		expect(nowNext([])).toEqual({ kind: 'empty' });
	});
});
