import { defaultFormatPreferences, type DateFormat } from '$lib/format-preferences';
import { formatCalendarDate, type CalendarLocale } from './calendar';
import type { ItineraryNoteTarget } from './schema';

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
