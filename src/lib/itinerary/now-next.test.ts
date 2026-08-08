import { describe, expect, it } from 'vitest';
import { getNowNextState } from './now-next';
import type { ItineraryTiming } from './schema';

const day = 86_400_000;
const now = Date.UTC(2026, 3, 12, 12, 0);

type TestItem = Readonly<{
	id: string;
	timing: ItineraryTiming;
}>;

function exactItem(id: string, startAt: number, endAt?: number): TestItem {
	return {
		id,
		timing: { kind: 'exact', startAt, ...(endAt === undefined ? {} : { endAt }) }
	};
}

describe('Now / Next presentation', () => {
	it('shows a countdown and the first item before the trip', () => {
		const firstItem = exactItem('departure', now + 81 * day);

		expect(getNowNextState([firstItem], now)).toEqual({
			kind: 'before-trip',
			daysUntilStart: 81,
			nextItem: firstItem
		});
	});

	it('subdues the latest completed item between itinerary items', () => {
		const previousItem = exactItem('breakfast', now - day);
		const nextItem = exactItem('museum', now + day);

		expect(getNowNextState([nextItem, previousItem], now)).toEqual({
			kind: 'between-items',
			previousItem,
			nextItem
		});
	});

	it('shows a definite exact item as current with its following item', () => {
		const currentItem = exactItem('flight', now - 30 * 60_000, now + 30 * 60_000);
		const nextItem = exactItem('hotel', now + day);

		expect(getNowNextState([nextItem, currentItem], now)).toEqual({
			kind: 'exact-current',
			currentItem,
			nextItem
		});
	});

	it('does not present an approximate item as definitely current', () => {
		const approximateItem: TestItem = {
			id: 'tour',
			timing: { kind: 'approximate', nominalAt: now, toleranceMinutes: 30 }
		};

		expect(getNowNextState([approximateItem], now)).toEqual({
			kind: 'next-only',
			nextItem: approximateItem
		});
	});

	it('identifies an active window without calling it a current item', () => {
		const currentItem: TestItem = {
			id: 'check-in',
			timing: { kind: 'window', earliestAt: now - 30 * 60_000, latestAt: now + 30 * 60_000 }
		};
		const nextItem = exactItem('dinner', now + day);

		expect(getNowNextState([nextItem, currentItem], now)).toEqual({
			kind: 'window-active',
			currentItem,
			nextItem
		});
	});

	it('shows completion after the final timing has ended', () => {
		expect(getNowNextState([exactItem('return', now - day)], now)).toEqual({
			kind: 'complete'
		});
	});

	it('handles an empty itinerary', () => {
		expect(getNowNextState([], now)).toEqual({ kind: 'empty' });
	});
});
