import { isCompleteLocalDateTime } from '$lib/itinerary/zoned-time';

/** Supplies a date for a complete time-only input without replacing an entered date. */
export function defaultDateForTimeOnlyValue(value: string, defaultDate: string | undefined): string {
	if (!value.startsWith('T')) {
		return value;
	}

	const valueWithDefaultDate = `${defaultDate ?? ''}${value}`;
	return isCompleteLocalDateTime(valueWithDefaultDate) ? valueWithDefaultDate : value;
}
