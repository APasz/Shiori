import { z } from 'zod';
import { calendarDateSchema, ianaTimeZoneSchema } from './schema';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

export const defaultNoteAnchorTime = '12:00';

const legacyDayNoteSchema = z
	.object({
		date: calendarDateSchema,
		kind: z.literal('day'),
		timeZone: ianaTimeZoneSchema
	})
	.passthrough();

type ItineraryRecord = Record<string, unknown>;

/** Produces the default local-noon placement for a daily note. */
export function defaultDayNoteAnchorAt(date: string, timeZone: string): number | null {
	return zonedDateTimeToUnixMilliseconds(`${date}T${defaultNoteAnchorTime}`, timeZone);
}

/** Converts the pre-anchor daily-note shape without changing unrelated note fields. */
export function migrateLegacyDayNote(note: unknown): unknown {
	const parsedNote = legacyDayNoteSchema.safeParse(note);
	if (!parsedNote.success) {
		return note;
	}

	const anchorAt = defaultDayNoteAnchorAt(parsedNote.data.date, parsedNote.data.timeZone);
	if (anchorAt === null) {
		return note;
	}

	const migratedNote: ItineraryRecord = {
		...parsedNote.data,
		anchorAt,
		id: `day-note-${parsedNote.data.date}`
	};
	delete migratedNote.date;
	return migratedNote;
}

/** Converts every legacy daily note in an itinerary, preserving absent or malformed note lists for validation. */
export function migrateLegacyDayNotes<SourceItinerary extends ItineraryRecord>(
	itinerary: SourceItinerary
): SourceItinerary {
	if (!Array.isArray(itinerary.notes)) {
		return itinerary;
	}
	return { ...itinerary, notes: itinerary.notes.map(migrateLegacyDayNote) };
}
