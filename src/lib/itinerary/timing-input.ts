import { formatTimestampForTimeZoneInput, isCompleteLocalDateTime } from './zoned-time';

/** Returns a usable start date or derives one from a fallback schedule in the selected time zone. */
export function defaultEndDateForTimingInput(
	startAt: string,
	fallbackStartAt: number | undefined,
	timeZone: string
): string | undefined {
	const startDate = startAt.slice(0, 10);
	if (isCompleteLocalDateTime(`${startDate}T00:00`)) {
		return startDate;
	}

	return fallbackStartAt === undefined
		? undefined
		: formatTimestampForTimeZoneInput(fallbackStartAt, timeZone)?.slice(0, 10);
}
