import { formatTimestampForTimeZoneInput, isValidIanaTimeZone } from './zoned-time';

export type FormattedLocalTimestamp = Readonly<{
	date: string;
	time: string;
}>;

const localDateTimePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/;

/** Converts a browser-local datetime form value to a canonical Unix-millisecond timestamp. */
export function localDateTimeToUnixMilliseconds(value: string): number | null {
	const matched = localDateTimePattern.exec(value);
	if (!matched?.groups) {
		return null;
	}

	const { day, hour, minute, month, year } = matched.groups;
	const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

	return localDate.getFullYear() === Number(year) &&
		localDate.getMonth() === Number(month) - 1 &&
		localDate.getDate() === Number(day) &&
		localDate.getHours() === Number(hour) &&
		localDate.getMinutes() === Number(minute)
		? localDate.getTime()
		: null;
}

export function formatTimestampInTimeZone(timestamp: number, timeZone: string): FormattedLocalTimestamp | null {
	if (!isValidIanaTimeZone(timeZone)) {
		return null;
	}
	const formatted = formatTimestampForTimeZoneInput(timestamp, timeZone);
	if (!formatted) {
		return null;
	}
	const [date, time] = formatted.split('T', 2);
	return date && time ? { date, time } : null;
}

export function formatLocalTimestamp(timestamp: number): FormattedLocalTimestamp | null {
	return formatTimestampInTimeZone(timestamp, Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function formatLocalTimestampForInput(timestamp: number): string | null {
	const formatted = formatLocalTimestamp(timestamp);
	return formatted ? `${formatted.date}T${formatted.time}` : null;
}
