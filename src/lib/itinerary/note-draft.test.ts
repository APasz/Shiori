import { describe, expect, it } from 'vitest';
import {
	emptyNoteEntryDraft,
	emptyNoteEstimatedCostDraft,
	emptyNoteLinkDraft,
	itineraryNoteDraft,
	itineraryNoteDraftFingerprint,
	validateItineraryNoteDraft,
	type ItineraryNoteDraft
} from './note-draft';
import type { ItineraryNote } from './schema';

const dayTarget = { date: '2026-04-13', kind: 'day' } as const;

describe('itinerary note drafts', () => {
	it('hydrates persisted values and normalizes optional fields for saving', () => {
		const persistedNote: ItineraryNote = {
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
			kind: 'day',
			date: '2026-04-13',
			text: 'Consider a guided tour.',
			timeZone: 'Australia/Melbourne'
		};

		const draft = itineraryNoteDraft(persistedNote, 'UTC');
		expect(draft).toMatchObject({
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
		const validation = validateItineraryNoteDraft(draft, dayTarget);
		if (!validation.valid) {
			throw new Error(validation.error);
		}

		expect(validation.note).toEqual({
			date: '2026-04-13',
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
			kind: 'day',
			text: 'Consider a guided tour.',
			timeZone: 'Australia/Melbourne'
		});
	});

	it('creates an empty draft in the supplied default time zone', () => {
		expect(itineraryNoteDraft(undefined, 'Asia/Tokyo')).toEqual({ entries: [], text: '', timeZone: 'Asia/Tokyo' });
		expect(emptyNoteEntryDraft('entry-1')).toMatchObject({ id: 'entry-1', state: 'idea' });
		expect(emptyNoteEstimatedCostDraft('cost-1', 'JPY')).toEqual({
			amount: '',
			currency: 'JPY',
			id: 'cost-1',
			label: ''
		});
		expect(emptyNoteLinkDraft('link-1')).toEqual({ id: 'link-1', name: '', url: '' });
	});

	it('rejects incomplete links and non-positive estimates before making a request', () => {
		const draft: ItineraryNoteDraft = {
			entries: [
				{
					...emptyNoteEntryDraft('entry-1'),
					estimatedCosts: [{ amount: '0', currency: 'AUD', id: 'cost-1', label: 'Entry' }],
					links: [{ id: 'link-1', name: 'Venue', url: '' }],
					title: 'Museum'
				}
			],
			text: '',
			timeZone: 'UTC'
		};

		expect(validateItineraryNoteDraft(draft, dayTarget)).toEqual({
			error: 'Enter a positive AUD estimate with the supported number of decimal places.',
			valid: false
		});

		draft.entries[0].estimatedCosts[0].amount = '10';
		expect(validateItineraryNoteDraft(draft, dayTarget)).toEqual({
			error: 'Each link needs both a name and URL.',
			valid: false
		});
	});

	it('changes its discard snapshot when any editable value changes', () => {
		const draft = itineraryNoteDraft(undefined, 'UTC');
		const initialFingerprint = itineraryNoteDraftFingerprint(draft);
		draft.entries.push(emptyNoteEntryDraft('entry-1'));

		expect(itineraryNoteDraftFingerprint(draft)).not.toBe(initialFingerprint);
	});
});
