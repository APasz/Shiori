import { describe, expect, it } from 'vitest';
import { dayNoteActionLabel, dayNoteSummariesByDate } from './note-presentation';
import type { ItineraryNote } from './schema';

describe('dayNoteSummariesByDate', () => {
	it('returns structured-entry counts and freeform-note presence for each day note', () => {
		const notes: ItineraryNote[] = [
			{ entries: [], kind: 'trip', text: 'Pack light.', timeZone: 'UTC' },
			{
				date: '2026-04-13',
				entries: [
					{ estimatedCosts: [], id: 'museum', links: [], state: 'idea', title: 'Museum' },
					{ estimatedCosts: [], id: 'park', links: [], state: 'idea', title: 'Park' }
				],
				kind: 'day',
				text: '',
				timeZone: 'UTC'
			},
			{ date: '2026-04-14', entries: [], kind: 'day', text: 'Keep this flexible.', timeZone: 'UTC' }
		];

		const summaries = dayNoteSummariesByDate(notes);

		expect(summaries.get('2026-04-13')).toEqual({ entryCount: 2, hasFreeformText: false });
		expect(summaries.get('2026-04-14')).toEqual({ entryCount: 0, hasFreeformText: true });
		expect(summaries.has('trip')).toBe(false);
		expect(dayNoteActionLabel(summaries.get('2026-04-13'))).toBe('Notes 2');
		expect(dayNoteActionLabel(summaries.get('2026-04-14'))).toBe('Notes 日');
		expect(dayNoteActionLabel(undefined)).toBe('Notes');
	});
});
