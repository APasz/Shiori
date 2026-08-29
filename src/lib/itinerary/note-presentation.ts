import { defaultFormatPreferences, type DateFormat } from '$lib/format-preferences';
import { formatCalendarDate, type CalendarLocale } from './calendar';
import type { ItineraryNote, ItineraryNoteTarget } from './schema';

export type DayNoteSummary = Readonly<{
	entryCount: number;
	hasFreeformText: boolean;
}>;

export function dayNoteSummariesByDate(notes: readonly ItineraryNote[]): ReadonlyMap<string, DayNoteSummary> {
	const summaries = new Map<string, DayNoteSummary>();
	for (const note of notes) {
		if (note.kind === 'day') {
			summaries.set(note.date, { entryCount: note.entries.length, hasFreeformText: note.text.trim() !== '' });
		}
	}
	return summaries;
}

export function dayNoteActionLabel(summary: DayNoteSummary | undefined): string {
	const entryCount = summary?.entryCount ?? 0;
	return `Notes${entryCount > 0 ? ` ${entryCount}` : ''}${summary?.hasFreeformText ? ' 日' : ''}`;
}

export function itineraryNoteTargetTitle(
	target: ItineraryNoteTarget,
	locale: CalendarLocale = null,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat
): string {
	return target.kind === 'trip'
		? 'Trip notes'
		: (formatCalendarDate(target.date, 'date', locale, dateFormat) ?? target.date);
}

export function itineraryNoteTargetDescription(target: ItineraryNoteTarget): string {
	return target.kind === 'trip'
		? 'Ideas, budgets, and plans that span the whole trip.'
		: 'Keep alternatives, estimates, and reminders for this day.';
}

export function itineraryNoteTargetLabel(target: ItineraryNoteTarget): string {
	return target.kind === 'trip' ? 'Trip notepad' : 'Day notepad';
}
