import { describe, expect, it } from 'vitest';
import {
	availabilityConstraintDraftFromConstraint,
	availabilityConstraintDraftForTimeZone,
	availabilityTypesForItem,
	createAvailabilityConstraintDraft,
	defaultAvailabilityType,
	validateAvailabilityConstraintDraft
} from './availability-draft';

describe('availability constraint drafts', () => {
	it('uses item-specific suggestions first while retaining every generic availability type', () => {
		expect(defaultAvailabilityType('activity')).toBe('opening-hours');
		expect(defaultAvailabilityType('accommodation')).toBe('reception-hours');
		expect(defaultAvailabilityType('transport')).toBe('desk-hours');
		expect(availabilityTypesForItem('activity').slice(0, 4)).toEqual([
			'opening-hours',
			'last-admission',
			'desk-hours',
			'other'
		]);
		expect(availabilityTypesForItem('activity')).toContain('reception-hours');
	});

	it('defaults a new period to the item date and time zone without inventing times', () => {
		expect(
			createAvailabilityConstraintDraft({
				defaultDate: '2026-04-12',
				id: 'museum-hours',
				itemType: 'activity',
				timeZone: 'Asia/Tokyo'
			})
		).toEqual({
			at: '2026-04-12T',
			endAt: '2026-04-12T',
			id: 'museum-hours',
			isExpanded: true,
			label: '',
			startAt: '2026-04-12T',
			timingKind: 'period',
			timeZone: 'Asia/Tokyo',
			type: 'opening-hours'
		});
	});

	it('converts period dates in the selected time zone and restores them for editing', () => {
		const validation = validateAvailabilityConstraintDraft({
			at: '',
			endAt: '2026-04-12T18:00',
			id: 'ticket-desk',
			isExpanded: true,
			label: ' Ticket desk ',
			startAt: '2026-04-12T09:00',
			timingKind: 'period',
			timeZone: 'Asia/Tokyo',
			type: 'desk-hours'
		});

		if (!validation.success) {
			throw new Error('The availability period should be valid.');
		}
		expect(validation.data).toEqual({
			id: 'ticket-desk',
			label: 'Ticket desk',
			timing: {
				endAt: Date.UTC(2026, 3, 12, 9),
				kind: 'period',
				startAt: Date.UTC(2026, 3, 12),
				timeZone: 'Asia/Tokyo'
			},
			type: 'desk-hours'
		});
		expect(availabilityConstraintDraftFromConstraint(validation.data)).toMatchObject({
			endAt: '2026-04-12T18:00',
			startAt: '2026-04-12T09:00',
			timeZone: 'Asia/Tokyo',
			timingKind: 'period'
		});
	});

	it('converts deadlines and rejects periods whose end is not after their start', () => {
		const deadline = validateAvailabilityConstraintDraft({
			at: '2026-04-12T16:30',
			endAt: '',
			id: 'last-entry',
			isExpanded: true,
			label: 'Final entry',
			startAt: '',
			timingKind: 'deadline',
			timeZone: 'Asia/Tokyo',
			type: 'last-admission'
		});
		if (!deadline.success) {
			throw new Error('The availability deadline should be valid.');
		}
		expect(deadline.data.timing).toEqual({
			at: Date.UTC(2026, 3, 12, 7, 30),
			kind: 'deadline',
			timeZone: 'Asia/Tokyo'
		});

		const invalidPeriod = validateAvailabilityConstraintDraft({
			at: '',
			endAt: '2026-04-12T09:00',
			id: 'reversed-hours',
			isExpanded: true,
			label: '',
			startAt: '2026-04-12T17:00',
			timingKind: 'period',
			timeZone: 'Asia/Tokyo',
			type: 'opening-hours'
		});
		expect(invalidPeriod.success).toBe(false);
		if (invalidPeriod.success) {
			throw new Error('The reversed availability period should be rejected.');
		}
		expect(invalidPeriod.error.issues).toContainEqual(
			expect.objectContaining({
				message: 'The end time must be after the start time.',
				path: ['timing', 'endAt']
			})
		);
	});

	it('preserves an existing repeated-hour instant while changing its time zone', () => {
		const secondOccurrence = Date.UTC(2026, 10, 1, 9, 30);
		const original = {
			id: 'late-admission',
			timing: { at: secondOccurrence, kind: 'deadline' as const, timeZone: 'America/Los_Angeles' },
			type: 'last-admission' as const
		};
		const draft = availabilityConstraintDraftFromConstraint(original);

		expect(draft.at).toBe('2026-11-01T01:30');
		const unchanged = validateAvailabilityConstraintDraft(draft);
		if (!unchanged.success) {
			throw new Error('The repeated-hour availability deadline should be valid.');
		}
		expect(unchanged.data.timing).toMatchObject({ at: secondOccurrence, timeZone: 'America/Los_Angeles' });

		const utcDraft = availabilityConstraintDraftForTimeZone(draft, 'UTC');
		expect(utcDraft).toMatchObject({ at: '2026-11-01T09:30', timeZone: 'UTC' });
		const converted = validateAvailabilityConstraintDraft(utcDraft);
		if (!converted.success) {
			throw new Error('The converted repeated-hour availability deadline should be valid.');
		}
		expect(converted.data.timing).toMatchObject({ at: secondOccurrence, timeZone: 'UTC' });
	});
});
