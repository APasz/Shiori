import { describe, expect, it } from 'vitest';
import {
	availabilityConstraintBounds,
	currentOrNextAvailabilityConstraint,
	isOpeningHoursPeriodConstraint,
	latestAvailabilityConstraint
} from './availability';
import type { Constraint } from './schema';

const now = Date.UTC(2026, 3, 12, 12);

const morningHours: Constraint = {
	id: 'morning-hours',
	timing: { endAt: now - 60 * 60_000, kind: 'period', startAt: now - 3 * 60 * 60_000, timeZone: 'UTC' },
	type: 'opening-hours'
};

const afternoonHours: Constraint = {
	id: 'afternoon-hours',
	timing: { endAt: now + 4 * 60 * 60_000, kind: 'period', startAt: now + 60 * 60_000, timeZone: 'UTC' },
	type: 'opening-hours'
};

describe('availability constraint selection', () => {
	it('uses inclusive timestamp bounds for periods and deadlines', () => {
		expect(availabilityConstraintBounds(morningHours.timing)).toEqual({
			endAt: now - 60 * 60_000,
			startAt: now - 3 * 60 * 60_000
		});
		expect(availabilityConstraintBounds({ at: now + 5 * 60_000, kind: 'deadline', timeZone: 'UTC' })).toEqual({
			endAt: now + 5 * 60_000,
			startAt: now + 5 * 60_000
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
				timing: { at: now, kind: 'deadline', timeZone: 'UTC' },
				type: 'last-admission'
			})
		).toBe(false);
	});

	it('chooses the active constraint before the nearest future constraint regardless of input order', () => {
		const currentHours: Constraint = {
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

	it('retains the chronologically latest constraint as a day-card fallback after every entry has passed', () => {
		const finalHours: Constraint = {
			id: 'final-hours',
			timing: { endAt: now - 5 * 60_000, kind: 'period', startAt: now - 30 * 60_000, timeZone: 'UTC' },
			type: 'opening-hours'
		};

		expect(latestAvailabilityConstraint([morningHours, finalHours])).toBe(finalHours);
		expect(currentOrNextAvailabilityConstraint([morningHours, finalHours], now)).toBeNull();
	});
});
