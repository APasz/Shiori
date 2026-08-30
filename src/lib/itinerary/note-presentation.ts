import { defaultFormatPreferences, type DateFormat } from '$lib/format-preferences';
import { formatCalendarDate, type CalendarLocale } from './calendar';
import { formatTimestampInTimeZone } from './time';
import type { DayItineraryNote, ItineraryNote, ItineraryNoteEditorTarget } from './schema';

export type DayNoteSummary = Readonly<{
	entryCount: number;
	hasFreeformText: boolean;
}>;

/** Returns the local calendar day where an absolute note anchor belongs for a viewer. */
export function dayNoteDate(note: DayItineraryNote, timeZone: string): string {
	const formatted = formatTimestampInTimeZone(note.anchorAt, timeZone);
	if (!formatted) {
		throw new Error(`Cannot localize note anchor ${note.anchorAt} in ${timeZone}.`);
	}
	return formatted.date;
}

/** Returns every daily note placed on a viewer-local calendar day. */
export function dayNotesForDate(
	notes: readonly ItineraryNote[],
	date: string,
	timeZone: string
): readonly DayItineraryNote[] {
	return notes.filter((note): note is DayItineraryNote => note.kind === 'day' && dayNoteDate(note, timeZone) === date);
}

export function dayNoteSummariesByDate(
	notes: readonly ItineraryNote[],
	timeZone: string
): ReadonlyMap<string, DayNoteSummary> {
	const summaries = new Map<string, DayNoteSummary>();
	for (const note of notes) {
		if (note.kind === 'day') {
			const date = dayNoteDate(note, timeZone);
			const previous = summaries.get(date);
			summaries.set(date, {
				entryCount: (previous?.entryCount ?? 0) + note.entries.length,
				hasFreeformText: (previous?.hasFreeformText ?? false) || note.text.trim() !== ''
			});
		}
	}
	return summaries;
}

export function dayNoteActionLabel(summary: DayNoteSummary | undefined): string {
	const entryCount = summary?.entryCount ?? 0;
	return `Notes${entryCount > 0 ? ` ${entryCount}` : ''}${summary?.hasFreeformText ? ' 日' : ''}`;
}

export function itineraryNoteTargetTitle(
	target: ItineraryNoteEditorTarget,
	locale: CalendarLocale = null,
	dateFormat: DateFormat = defaultFormatPreferences.dateFormat
): string {
	return target.kind === 'trip'
		? 'Trip notes'
		: (formatCalendarDate(target.date, 'date', locale, dateFormat) ?? target.date);
}

export function itineraryNoteTargetDescription(target: ItineraryNoteEditorTarget): string {
	return target.kind === 'trip'
		? 'Ideas, budgets, and plans that span the whole trip.'
		: 'Keep alternatives, estimates, and reminders for this day.';
}

export function itineraryNoteTargetLabel(target: ItineraryNoteEditorTarget): string {
	return target.kind === 'trip' ? 'Trip notepad' : 'Day notepad';
}
