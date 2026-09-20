import { formatTimestampForTimeZoneInput, isCompleteLocalDateTime } from './zoned-time';

/** Returns an entered start date or formats a caller-provided contextual start timestamp. */
export function defaultEndDateForTimingInput(
	startAt: string,
	contextStartAt: number | undefined,
	timeZone: string
): string | undefined {
	const startDate = startAt.slice(0, 10);
	if (isCompleteLocalDateTime(`${startDate}T00:00`)) {
		return startDate;
	}

	return contextStartAt === undefined
		? undefined
		: formatTimestampForTimeZoneInput(contextStartAt, timeZone)?.slice(0, 10);
}
