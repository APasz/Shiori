import { describe, expect, it } from 'vitest';
import { availabilityTimingKindLabels } from './availability';
import {
	availabilityConstraintDraftFromConstraint,
	availabilityConstraintDraftForTimingKind,
	availabilityConstraintDraftForType,
	availabilityConstraintDraftForTimeZone,
	availabilityTypesForItem,
	createAvailabilityConstraintDraft,
	defaultAvailabilityType,
	isAvailabilityConstraintDraftIncomplete,
	validateAvailabilityConstraintDraft
} from './availability-draft';

describe('availability constraint drafts', () => {
	it('labels one-sided timing modes explicitly', () => {
		expect(availabilityTimingKindLabels).toEqual({ period: 'Period', from: 'From', until: 'Until' });
	});

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
		expect(availabilityTypesForItem('accommodation').slice(0, 3)).toEqual(['reception-hours', 'check-in', 'check-out']);
	});

	it('uses Period for a new Opening hours entry without inventing times', () => {
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

	it('uses Until when a new entry is changed to Last admission', () => {
		const draft = createAvailabilityConstraintDraft({
			defaultDate: '2026-04-12',
			id: 'museum-admission',
			itemType: 'activity',
			timeZone: 'Asia/Tokyo'
		});

		expect(isAvailabilityConstraintDraftIncomplete(draft)).toBe(true);
		expect(availabilityConstraintDraftForType(draft, 'last-admission')).toMatchObject({
			at: '2026-04-12T',
			timingKind: 'until',
			type: 'last-admission'
		});
	});

	it('uses Until when a new entry is changed to Cutoff', () => {
		const draft = createAvailabilityConstraintDraft({
			defaultDate: '2026-04-12',
			id: 'train-cutoff',
			itemType: 'transport',
			timeZone: 'Asia/Tokyo'
		});

		expect(availabilityConstraintDraftForType(draft, 'cutoff')).toMatchObject({
			at: '2026-04-12T',
			timingKind: 'until',
			type: 'cutoff'
		});
	});

	it('uses From for Check-in and Until for Check-out', () => {
		const draft = createAvailabilityConstraintDraft({
			defaultDate: '2026-04-12',
			id: 'hotel-check-in',
			itemType: 'accommodation',
			timeZone: 'Asia/Tokyo'
		});

		expect(availabilityConstraintDraftForType(draft, 'check-in')).toMatchObject({
			at: '2026-04-12T',
			timingKind: 'from',
			type: 'check-in'
		});
		expect(availabilityConstraintDraftForType(draft, 'check-out')).toMatchObject({
			at: '2026-04-12T',
			timingKind: 'until',
			type: 'check-out'
		});
	});

	it('keeps the existing timing mode when a new entry is changed to Other', () => {
		const untilDraft = availabilityConstraintDraftForType(
			createAvailabilityConstraintDraft({
				defaultDate: '2026-04-12',
				id: 'train-cutoff',
				itemType: 'transport',
				timeZone: 'Asia/Tokyo'
			}),
			'cutoff'
		);

		expect(availabilityConstraintDraftForType(untilDraft, 'other')).toEqual({
			...untilDraft,
			type: 'other'
		});
	});

	it('retains complete Period and one-sided data when the availability type changes', () => {
		const periodDraft = availabilityConstraintDraftFromConstraint({
			id: 'museum-hours',
			timing: {
				endAt: Date.UTC(2026, 3, 12, 18),
				kind: 'period' as const,
				startAt: Date.UTC(2026, 3, 12, 9),
				timeZone: 'UTC'
			},
			type: 'opening-hours' as const
		});
		const untilDraft = availabilityConstraintDraftFromConstraint({
			id: 'ticket-cutoff',
			timing: { at: Date.UTC(2026, 3, 12, 16), kind: 'until' as const, timeZone: 'UTC' },
			type: 'cutoff' as const
		});

		expect(isAvailabilityConstraintDraftIncomplete(periodDraft)).toBe(false);
		expect(isAvailabilityConstraintDraftIncomplete(untilDraft)).toBe(false);
		expect(availabilityConstraintDraftForType(periodDraft, 'last-admission')).toEqual({
			...periodDraft,
			type: 'last-admission'
		});
		expect(availabilityConstraintDraftForType(untilDraft, 'opening-hours')).toEqual({
			...untilDraft,
			type: 'opening-hours'
		});
	});

	it('retains complete timing input that still needs validation when the availability type changes', () => {
		const draft = {
			...createAvailabilityConstraintDraft({
				defaultDate: '2026-04-12',
				id: 'museum-hours',
				itemType: 'activity',
				timeZone: 'UTC'
			}),
			endAt: '2026-04-12T09:00',
			startAt: '2026-04-12T18:00'
		};

		expect(isAvailabilityConstraintDraftIncomplete(draft)).toBe(false);
		expect(availabilityConstraintDraftForType(draft, 'last-admission')).toEqual({
			...draft,
			type: 'last-admission'
		});
	});

	it('preserves a usable date when an incomplete draft automatically switches timing mode', () => {
		const draft = {
			...createAvailabilityConstraintDraft({
				defaultDate: '2026-04-12',
				id: 'museum-admission',
				itemType: 'activity',
				timeZone: 'Asia/Tokyo'
			}),
			at: '',
			endAt: '',
			startAt: '2026-04-12T09:30'
		};

		expect(availabilityConstraintDraftForType(draft, 'last-admission')).toMatchObject({
			at: '2026-04-12T',
			timingKind: 'until',
			type: 'last-admission'
		});
	});

	it('retains entered target-mode input when an incomplete draft automatically switches timing mode', () => {
		const draft = {
			...createAvailabilityConstraintDraft({
				defaultDate: '2026-04-12',
				id: 'museum-admission',
				itemType: 'activity',
				timeZone: 'UTC'
			}),
			at: '2026-04-13T16:00',
			endAt: '',
			startAt: '2026-04-12T09:00'
		};

		expect(availabilityConstraintDraftForType(draft, 'last-admission')).toMatchObject({
			at: '2026-04-13T16:00',
			timingKind: 'until',
			type: 'last-admission'
		});
	});

	it('keeps a period date when switching directly to Until', () => {
		const periodDraft = availabilityConstraintDraftFromConstraint({
			id: 'museum-hours',
			timing: {
				endAt: Date.UTC(2026, 3, 12, 18),
				kind: 'period' as const,
				startAt: Date.UTC(2026, 3, 12, 9),
				timeZone: 'UTC'
			},
			type: 'opening-hours' as const
		});

		expect(availabilityConstraintDraftForTimingKind(periodDraft, 'until')).toMatchObject({
			at: '2026-04-12T',
			timingKind: 'until'
		});
	});

	it('keeps a one-sided date when switching directly to Period', () => {
		const untilDraft = availabilityConstraintDraftFromConstraint({
			id: 'last-entry',
			timing: { at: Date.UTC(2026, 3, 12, 16, 30), kind: 'until' as const, timeZone: 'UTC' },
			type: 'last-admission' as const
		});

		expect(availabilityConstraintDraftForTimingKind(untilDraft, 'period')).toMatchObject({
			endAt: '2026-04-12T',
			startAt: '2026-04-12T',
			timingKind: 'period'
		});
	});

	it('retains an entered instant when switching between one-sided bounds', () => {
		const fromDraft = availabilityConstraintDraftFromConstraint({
			id: 'property-check-in',
			timing: { at: Date.UTC(2026, 3, 12, 6), kind: 'from', timeZone: 'UTC' },
			type: 'check-in'
		});

		expect(availabilityConstraintDraftForTimingKind(fromDraft, 'until')).toMatchObject({
			at: '2026-04-12T06:00',
			timingKind: 'until'
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

	it('converts one-sided bounds and rejects periods whose end is not after their start', () => {
		const until = validateAvailabilityConstraintDraft({
			at: '2026-04-12T16:30',
			endAt: '',
			id: 'last-entry',
			isExpanded: true,
			label: 'Final entry',
			startAt: '',
			timingKind: 'until',
			timeZone: 'Asia/Tokyo',
			type: 'last-admission'
		});
		if (!until.success) {
			throw new Error('The availability Until bound should be valid.');
		}
		expect(until.data.timing).toEqual({
			at: Date.UTC(2026, 3, 12, 7, 30),
			kind: 'until',
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
			timing: { at: secondOccurrence, kind: 'until' as const, timeZone: 'America/Los_Angeles' },
			type: 'last-admission' as const
		};
		const draft = availabilityConstraintDraftFromConstraint(original);

		expect(draft.at).toBe('2026-11-01T01:30');
		const unchanged = validateAvailabilityConstraintDraft(draft);
		if (!unchanged.success) {
			throw new Error('The repeated-hour availability Until bound should be valid.');
		}
		expect(unchanged.data.timing).toMatchObject({ at: secondOccurrence, timeZone: 'America/Los_Angeles' });

		const utcDraft = availabilityConstraintDraftForTimeZone(draft, 'UTC');
		expect(utcDraft).toMatchObject({ at: '2026-11-01T09:30', timeZone: 'UTC' });
		const converted = validateAvailabilityConstraintDraft(utcDraft);
		if (!converted.success) {
			throw new Error('The converted repeated-hour availability Until bound should be valid.');
		}
		expect(converted.data.timing).toMatchObject({ at: secondOccurrence, timeZone: 'UTC' });
	});
});
