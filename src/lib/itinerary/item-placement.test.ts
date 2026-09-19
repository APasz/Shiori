import { describe, expect, it } from 'vitest';
import { hasItemTiming, itemPlacementAnchorAt, itemPlacementAnchorForDate, itemPlacementDate } from './item-placement';

describe('item day placement', () => {
	it('anchors an unscheduled item at local noon while retaining only its date semantics', () => {
		const anchorAt = itemPlacementAnchorAt('2026-04-12', 'Asia/Tokyo');
		expect(anchorAt).toBe(Date.UTC(2026, 3, 12, 3));
		if (anchorAt === null) {
			throw new Error('A valid placement date should create an anchor.');
		}
		expect(itemPlacementDate({ anchorAt, timeZone: 'Asia/Tokyo' })).toBe('2026-04-12');
	});

	it('distinguishes real schedules from a day-only placement regardless of availability', () => {
		const unscheduled = {
			availability: [] as const,
			id: 'museum',
			placement: { anchorAt: Date.UTC(2026, 3, 12, 3), timeZone: 'Asia/Tokyo' }
		};
		const scheduled = { id: 'train', timing: { kind: 'exact' as const, startAt: Date.UTC(2026, 3, 12, 4) } };

		expect(hasItemTiming(unscheduled)).toBe(false);
		expect(hasItemTiming(scheduled)).toBe(true);
	});

	it('preserves an existing anchor until its represented day or time zone changes', () => {
		const placement = { anchorAt: Date.UTC(2026, 3, 12, 5), timeZone: 'Asia/Tokyo' };

		expect(itemPlacementAnchorForDate(placement, '2026-04-12', 'Asia/Tokyo')).toBe(placement.anchorAt);
		expect(itemPlacementAnchorForDate(placement, '2026-04-13', 'Asia/Tokyo')).toBe(Date.UTC(2026, 3, 13, 3));
		expect(itemPlacementAnchorForDate(placement, '2026-04-12', 'Australia/Melbourne')).toBe(Date.UTC(2026, 3, 12, 2));
	});
});
