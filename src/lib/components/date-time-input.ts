import { isCompleteLocalDateTime, zonedDateTimeToUnixMilliseconds } from '$lib/itinerary/zoned-time';

export type DateTimePickerMode = 'date-time' | 'date' | 'time';

/** Supplies a date for a complete time-only input without replacing an entered date. */
export function defaultDateForTimeOnlyValue(value: string, defaultDate: string | undefined): string {
	if (!value.startsWith('T')) {
		return value;
	}

	const valueWithDefaultDate = `${defaultDate ?? ''}${value}`;
	return isCompleteLocalDateTime(valueWithDefaultDate) ? valueWithDefaultDate : value;
}

/** Chooses an event-local timestamp for a time-zone label, with a safe fallback for incomplete input. */
export function timeZoneReferenceTimestamp(value: string, timeZone: string, fallback: number): number {
	const exactTimestamp = zonedDateTimeToUnixMilliseconds(value, timeZone);
	if (exactTimestamp !== null) {
		return exactTimestamp;
	}

	const dateOnlyTimestamp = zonedDateTimeToUnixMilliseconds(`${value.slice(0, 10)}T12:00`, timeZone);
	return dateOnlyTimestamp ?? fallback;
}
