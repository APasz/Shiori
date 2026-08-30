import { describe, expect, it } from 'vitest';
import {
	emptyNoteEntryDraft,
	emptyNoteEstimatedCostDraft,
	emptyNoteLinkDraft,
	itineraryNoteDraft,
	itineraryNoteDraftFingerprint,
	itineraryNoteDraftForTimeZone,
	validateItineraryNoteDraft,
	type ItineraryNoteDraft
} from './note-draft';
import type { ItineraryNote } from './schema';

const dayTarget = { date: '2026-04-13', kind: 'day' } as const;

describe('itinerary note drafts', () => {
	it('hydrates persisted values and normalizes optional fields for saving', () => {
		const persistedNote: ItineraryNote = {
			anchorAt: Date.UTC(2026, 3, 13, 2),
			entries: [
				{
					estimatedCosts: [{ amountMinor: 1234, currency: 'AUD', id: 'cost-1' }],
					id: 'entry-1',
					links: [{ label: 'Venue', url: 'https://example.com/venue' }],
					state: 'shortlisted',
					startTime: '09:30',
					title: 'Museum'
				}
			],
			id: 'day-note-2026-04-13',
			kind: 'day',
			text: 'Consider a guided tour.',
			timeZone: 'Australia/Melbourne'
		};

		const draft = itineraryNoteDraft(persistedNote, 'UTC', dayTarget);
		expect(draft).toMatchObject({
			anchorDate: '2026-04-13',
			anchorTime: '12:00',
			entries: [
				{
					estimatedCosts: [{ amount: '12.34', currency: 'AUD', id: 'cost-1', label: '' }],
					links: [{ id: 'entry-1-link-0', name: 'Venue', url: 'https://example.com/venue' }],
					note: '',
					endTime: ''
				}
			]
		});

		draft.entries[0].note = '  Arrive early.  ';
		draft.entries[0].estimatedCosts[0].label = ' Admission ';
		const validation = validateItineraryNoteDraft(draft);
		if (!validation.valid) {
			throw new Error(validation.error);
		}

		expect(validation.note).toEqual({
			anchorAt: Date.UTC(2026, 3, 13, 2),
			entries: [
				{
					estimatedCosts: [{ amountMinor: 1234, currency: 'AUD', id: 'cost-1', label: 'Admission' }],
					id: 'entry-1',
					links: [{ label: 'Venue', url: 'https://example.com/venue' }],
					note: 'Arrive early.',
					state: 'shortlisted',
					startTime: '09:30',
					title: 'Museum'
				}
			],
			id: 'day-note-2026-04-13',
			kind: 'day',
			text: 'Consider a guided tour.',
			timeZone: 'Australia/Melbourne'
		});
	});

	it('creates a daily draft at local noon on the clicked day in the supplied default time zone', () => {
		expect(itineraryNoteDraft(undefined, 'Asia/Tokyo', dayTarget, () => 'day-note-1')).toEqual({
			anchorAt: Date.UTC(2026, 3, 13, 3),
			anchorDate: '2026-04-13',
			anchorTime: '12:00',
			entries: [],
			id: 'day-note-1',
			kind: 'day',
			text: '',
			timeZone: 'Asia/Tokyo'
		});
		expect(itineraryNoteDraft(undefined, 'Asia/Tokyo', { kind: 'trip' })).toEqual({
			entries: [],
			kind: 'trip',
			text: '',
			timeZone: 'Asia/Tokyo'
		});
		expect(emptyNoteEntryDraft('entry-1')).toMatchObject({ id: 'entry-1', state: 'idea' });
		expect(emptyNoteEstimatedCostDraft('cost-1', 'JPY')).toEqual({
			amount: '',
			currency: 'JPY',
			id: 'cost-1',
			label: ''
		});
		expect(emptyNoteLinkDraft('link-1')).toEqual({ id: 'link-1', name: '', url: '' });
	});

	it("uses the clicked day as a new daily note's note-local anchor date", () => {
		const draft = itineraryNoteDraft(undefined, 'Asia/Tokyo', { date: '2026-04-12', kind: 'day' }, () => 'day-note-1');

		expect(draft).toMatchObject({
			anchorAt: Date.UTC(2026, 3, 12, 3),
			anchorDate: '2026-04-12',
			anchorTime: '12:00',
			timeZone: 'Asia/Tokyo'
		});
	});

	it('rejects incomplete links and non-positive estimates before making a request', () => {
		const draft: ItineraryNoteDraft = {
			anchorAt: Date.UTC(2026, 3, 13, 12),
			anchorDate: '2026-04-13',
			anchorTime: '12:00',
			entries: [
				{
					...emptyNoteEntryDraft('entry-1'),
					estimatedCosts: [{ amount: '0', currency: 'AUD', id: 'cost-1', label: 'Entry' }],
					links: [{ id: 'link-1', name: 'Venue', url: '' }],
					title: 'Museum'
				}
			],
			id: 'day-note-1',
			kind: 'day',
			text: '',
			timeZone: 'UTC'
		};

		expect(validateItineraryNoteDraft(draft)).toEqual({
			error: 'Enter a positive AUD estimate with the supported number of decimal places.',
			valid: false
		});

		draft.entries[0].estimatedCosts[0].amount = '10';
		expect(validateItineraryNoteDraft(draft)).toEqual({
			error: 'Each link needs both a name and URL.',
			valid: false
		});
	});

	it('changes its discard snapshot when any editable value changes', () => {
		const draft = itineraryNoteDraft(undefined, 'UTC', dayTarget, () => 'day-note-1');
		if (draft.kind !== 'day') {
			throw new Error('The day target should create a day note draft.');
		}
		const initialFingerprint = itineraryNoteDraftFingerprint(draft);
		draft.anchorTime = '15:00';

		expect(itineraryNoteDraftFingerprint(draft)).not.toBe(initialFingerprint);
	});

	it("keeps a daily anchor's wall-clock date and time while changing its time zone", () => {
		const draft = itineraryNoteDraft(undefined, 'Asia/Tokyo', dayTarget, () => 'day-note-1');
		const changedTimeZone = itineraryNoteDraftForTimeZone(draft, 'America/Los_Angeles');

		expect(changedTimeZone).toMatchObject({
			anchorAt: Date.UTC(2026, 3, 13, 19),
			anchorDate: '2026-04-13',
			anchorTime: '12:00',
			timeZone: 'America/Los_Angeles'
		});
		const validation = validateItineraryNoteDraft(changedTimeZone);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		expect(validation.note).toMatchObject({ anchorAt: Date.UTC(2026, 3, 13, 19) });
	});

	it('rejects an anchor time skipped by daylight saving after a time-zone change', () => {
		const draft = itineraryNoteDraft(undefined, 'UTC', { date: '2026-03-08', kind: 'day' }, () => 'day-note-1');
		if (draft.kind !== 'day') {
			throw new Error('The day target should create a day note draft.');
		}
		draft.anchorTime = '02:30';
		const changedTimeZone = itineraryNoteDraftForTimeZone(draft, 'America/Los_Angeles');

		expect(changedTimeZone).toMatchObject({
			anchorAt: null,
			anchorDate: '2026-03-08',
			anchorTime: '02:30',
			timeZone: 'America/Los_Angeles'
		});
		expect(validateItineraryNoteDraft(changedTimeZone)).toEqual({
			error: 'Choose a valid anchor time for the selected time zone.',
			valid: false
		});
	});

	it('rejects an anchor before the Unix epoch', () => {
		const draft: ItineraryNoteDraft = {
			anchorAt: Date.UTC(1969, 11, 31, 23, 59),
			anchorDate: '1969-12-31',
			anchorTime: '23:59',
			entries: [],
			id: 'day-note-epoch',
			kind: 'day',
			text: '',
			timeZone: 'UTC'
		};

		expect(validateItineraryNoteDraft(draft)).toEqual({
			error: 'Choose an anchor time on or after the Unix epoch.',
			valid: false
		});
	});

	it('retains an anchor in the second occurrence of a repeated local hour', () => {
		const anchorAt = Date.UTC(2026, 10, 1, 9, 30);
		const draft = itineraryNoteDraft(
			{
				anchorAt,
				entries: [],
				id: 'day-note-1',
				kind: 'day',
				text: 'Keep this flexible.',
				timeZone: 'America/Los_Angeles'
			},
			'UTC',
			{ date: '2026-11-01', kind: 'day' }
		);

		expect(draft).toMatchObject({ anchorDate: '2026-11-01', anchorTime: '01:30' });
		const validation = validateItineraryNoteDraft(draft);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		expect(validation.note).toMatchObject({ anchorAt });
	});

	it('keeps a repeated-hour wall-clock anchor while changing its time zone', () => {
		const draft = itineraryNoteDraft(undefined, 'UTC', { date: '2026-11-01', kind: 'day' }, () => 'day-note-1');
		if (draft.kind !== 'day') {
			throw new Error('The day target should create a day note draft.');
		}
		draft.anchorTime = '01:30';
		const changedTimeZone = itineraryNoteDraftForTimeZone(draft, 'America/Los_Angeles');

		expect(changedTimeZone).toMatchObject({
			anchorAt: Date.UTC(2026, 10, 1, 8, 30),
			anchorDate: '2026-11-01',
			anchorTime: '01:30',
			timeZone: 'America/Los_Angeles'
		});
		const validation = validateItineraryNoteDraft(changedTimeZone);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		expect(validation.note).toMatchObject({ anchorAt: Date.UTC(2026, 10, 1, 8, 30) });
	});
});
