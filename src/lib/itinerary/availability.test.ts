import { describe, expect, it } from 'vitest';
import {
	availabilityConstraintBounds,
	currentOrNextAvailabilityConstraint,
	isOpeningHoursPeriodConstraint,
	latestAvailabilityConstraint,
	preferredAvailabilityTimingKind
} from './availability';
import type { AvailabilityConstraint } from './schema';

const now = Date.UTC(2026, 3, 12, 12);

const morningHours: AvailabilityConstraint = {
	id: 'morning-hours',
	timing: { endAt: now - 60 * 60_000, kind: 'period', startAt: now - 3 * 60 * 60_000, timeZone: 'UTC' },
	type: 'opening-hours'
};

const afternoonHours: AvailabilityConstraint = {
	id: 'afternoon-hours',
	timing: { endAt: now + 4 * 60 * 60_000, kind: 'period', startAt: now + 60 * 60_000, timeZone: 'UTC' },
	type: 'opening-hours'
};

describe('availability constraint selection', () => {
	it('provides editor-only timing suggestions without constraining persisted shapes', () => {
		expect(preferredAvailabilityTimingKind('opening-hours')).toBe('period');
		expect(preferredAvailabilityTimingKind('reception-hours')).toBe('period');
		expect(preferredAvailabilityTimingKind('desk-hours')).toBe('period');
		expect(preferredAvailabilityTimingKind('storage-hours')).toBe('period');
		expect(preferredAvailabilityTimingKind('check-in')).toBe('from');
		expect(preferredAvailabilityTimingKind('check-out')).toBe('until');
		expect(preferredAvailabilityTimingKind('last-admission')).toBe('until');
		expect(preferredAvailabilityTimingKind('cutoff')).toBe('until');
		expect(preferredAvailabilityTimingKind('other')).toBeUndefined();
	});

	it('uses inclusive timestamp bounds for periods and one-sided constraints', () => {
		expect(availabilityConstraintBounds(morningHours.timing)).toEqual({
			endAt: now - 60 * 60_000,
			startAt: now - 3 * 60 * 60_000
		});
		expect(availabilityConstraintBounds({ at: now + 5 * 60_000, kind: 'from', timeZone: 'UTC' })).toEqual({
			endAt: Number.POSITIVE_INFINITY,
			startAt: now + 5 * 60_000
		});
		expect(availabilityConstraintBounds({ at: now + 5 * 60_000, kind: 'until', timeZone: 'UTC' })).toEqual({
			endAt: now + 5 * 60_000,
			startAt: Number.NEGATIVE_INFINITY
		});
	});

	it('identifies only opening-hour periods as making an item usable', () => {
		expect(isOpeningHoursPeriodConstraint(morningHours)).toBe(true);
		expect(
			isOpeningHoursPeriodConstraint({
				id: 'desk-hours',
				timing: { endAt: now + 60 * 60_000, kind: 'period', startAt: now, timeZone: 'UTC' },
				type: 'desk-hours'
			})
		).toBe(false);
		expect(
			isOpeningHoursPeriodConstraint({
				id: 'last-admission',
				timing: { at: now, kind: 'until', timeZone: 'UTC' },
				type: 'last-admission'
			})
		).toBe(false);
	});

	it('chooses the active constraint before the nearest future constraint regardless of input order', () => {
		const currentHours: AvailabilityConstraint = {
			id: 'current-hours',
			timing: { endAt: now + 60 * 60_000, kind: 'period', startAt: now - 60 * 60_000, timeZone: 'UTC' },
			type: 'opening-hours'
		};

		expect(currentOrNextAvailabilityConstraint([afternoonHours, currentHours, morningHours], now)).toEqual({
			constraint: currentHours,
			kind: 'current'
		});
		expect(currentOrNextAvailabilityConstraint([afternoonHours, morningHours], now)).toEqual({
			constraint: afternoonHours,
			kind: 'next'
		});
	});

	it('treats From as valid after its bound and Until as valid through its bound', () => {
		const checkIn: AvailabilityConstraint = {
			id: 'check-in',
			timing: { at: now + 60 * 60_000, kind: 'from', timeZone: 'UTC' },
			type: 'check-in'
		};
		const lastAdmission: AvailabilityConstraint = {
			id: 'last-admission',
			timing: { at: now + 30 * 60_000, kind: 'until', timeZone: 'UTC' },
			type: 'last-admission'
		};

		expect(currentOrNextAvailabilityConstraint([checkIn], now)).toEqual({ constraint: checkIn, kind: 'next' });
		expect(currentOrNextAvailabilityConstraint([lastAdmission], now)).toEqual({
			constraint: lastAdmission,
			kind: 'current'
		});
	});

	it('retains the chronologically latest constraint as a day-card fallback after every entry has passed', () => {
		const finalHours: AvailabilityConstraint = {
			id: 'final-hours',
			timing: { endAt: now - 5 * 60_000, kind: 'period', startAt: now - 30 * 60_000, timeZone: 'UTC' },
			type: 'opening-hours'
		};

		expect(latestAvailabilityConstraint([morningHours, finalHours])).toBe(finalHours);
		expect(currentOrNextAvailabilityConstraint([morningHours, finalHours], now)).toBeNull();
	});
});
