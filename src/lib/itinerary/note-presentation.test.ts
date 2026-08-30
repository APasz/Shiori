import { describe, expect, it } from 'vitest';
import { dayNoteActionLabel, dayNoteSummariesByDate, dayNotesForDate } from './note-presentation';
import type { ItineraryNote } from './schema';

describe('dayNoteSummariesByDate', () => {
	it('returns structured-entry counts and freeform-note presence for each day note', () => {
		const notes: ItineraryNote[] = [
			{ entries: [], kind: 'trip', text: 'Pack light.', timeZone: 'UTC' },
			{
				anchorAt: Date.UTC(2026, 3, 13, 12),
				entries: [
					{ estimatedCosts: [], id: 'museum', links: [], state: 'idea', title: 'Museum' },
					{ estimatedCosts: [], id: 'park', links: [], state: 'idea', title: 'Park' }
				],
				id: 'day-note-13',
				kind: 'day',
				text: '',
				timeZone: 'UTC'
			},
			{
				anchorAt: Date.UTC(2026, 3, 14, 12),
				entries: [],
				id: 'day-note-14',
				kind: 'day',
				text: 'Keep this flexible.',
				timeZone: 'UTC'
			}
		];

		const summaries = dayNoteSummariesByDate(notes, 'UTC');

		expect(summaries.get('2026-04-13')).toEqual({ entryCount: 2, hasFreeformText: false });
		expect(summaries.get('2026-04-14')).toEqual({ entryCount: 0, hasFreeformText: true });
		expect(summaries.has('trip')).toBe(false);
		expect(dayNoteActionLabel(summaries.get('2026-04-13'))).toBe('Notes 2');
		expect(dayNoteActionLabel(summaries.get('2026-04-14'))).toBe('Notes 日');
		expect(dayNoteActionLabel(undefined)).toBe('Notes');
		expect(dayNotesForDate(notes, '2026-04-13', 'UTC').map((note) => note.id)).toEqual(['day-note-13']);
	});

	it('projects a note anchor into each viewer-local calendar day', () => {
		const notes: ItineraryNote[] = [
			{
				anchorAt: Date.UTC(2026, 3, 13, 3),
				entries: [],
				id: 'tokyo-noon',
				kind: 'day',
				text: '',
				timeZone: 'Asia/Tokyo'
			}
		];

		const summaries = dayNoteSummariesByDate(notes, 'America/Los_Angeles');

		expect(dayNotesForDate(notes, '2026-04-13', 'Asia/Tokyo').map((note) => note.id)).toEqual(['tokyo-noon']);
		expect(summaries.get('2026-04-12')).toEqual({ entryCount: 0, hasFreeformText: false });
		expect(dayNotesForDate(notes, '2026-04-12', 'America/Los_Angeles').map((note) => note.id)).toEqual(['tokyo-noon']);
	});

	it('keeps every note that lands on the same viewer-local day', () => {
		const notes: ItineraryNote[] = [
			{
				anchorAt: Date.UTC(2026, 3, 13, 3),
				entries: [],
				id: 'tokyo-noon',
				kind: 'day',
				text: 'First note.',
				timeZone: 'Asia/Tokyo'
			},
			{
				anchorAt: Date.UTC(2026, 3, 13, 6),
				entries: [{ estimatedCosts: [], id: 'entry', links: [], state: 'idea', title: 'Second entry' }],
				id: 'tokyo-afternoon',
				kind: 'day',
				text: '',
				timeZone: 'Asia/Tokyo'
			}
		];

		expect(dayNotesForDate(notes, '2026-04-12', 'America/Los_Angeles').map((note) => note.id)).toEqual([
			'tokyo-noon',
			'tokyo-afternoon'
		]);
		expect(dayNoteSummariesByDate(notes, 'America/Los_Angeles').get('2026-04-12')).toEqual({
			entryCount: 1,
			hasFreeformText: true
		});
	});
});
