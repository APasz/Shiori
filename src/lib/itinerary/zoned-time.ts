import { isOnOrAfterUnixEpoch, unixEpochMilliseconds } from './unix-time';

type LocalDateTimeParts = {
	day: number;
	hour: number;
	minute: number;
	month: number;
	year: number;
};

const localDateTimePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
	const existing = formatters.get(timeZone);
	if (existing) {
		return existing;
	}

	try {
		const formatter = new Intl.DateTimeFormat('en-AU', {
			calendar: 'iso8601',
			day: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23',
			minute: '2-digit',
			month: '2-digit',
			numberingSystem: 'latn',
			timeZone,
			year: 'numeric'
		});
		formatters.set(timeZone, formatter);
		return formatter;
	} catch {
		return null;
	}
}

function localParts(timestamp: number, timeZone: string): LocalDateTimeParts | null {
	const formatter = formatterFor(timeZone);
	if (!formatter) {
		return null;
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	let day: number | undefined;
	let hour: number | undefined;
	let minute: number | undefined;
	let month: number | undefined;
	let year: number | undefined;

	for (const part of formatter.formatToParts(date)) {
		switch (part.type) {
			case 'year':
				year = Number(part.value);
				break;
			case 'month':
				month = Number(part.value);
				break;
			case 'day':
				day = Number(part.value);
				break;
			case 'hour':
				hour = Number(part.value);
				break;
			case 'minute':
				minute = Number(part.value);
				break;
		}
	}

	return day === undefined || hour === undefined || minute === undefined || month === undefined || year === undefined
		? null
		: { day, hour, minute, month, year };
}

function parseLocalDateTime(value: string): LocalDateTimeParts | null {
	const matched = localDateTimePattern.exec(value);
	if (!matched?.groups) {
		return null;
	}

	const parts = {
		day: Number(matched.groups.day),
		hour: Number(matched.groups.hour),
		minute: Number(matched.groups.minute),
		month: Number(matched.groups.month),
		year: Number(matched.groups.year)
	};
	const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
	return date.getUTCFullYear() === parts.year &&
		date.getUTCMonth() === parts.month - 1 &&
		date.getUTCDate() === parts.day
		? parts
		: null;
}

/** Returns whether a value contains a complete, valid local calendar date and time. */
export function isCompleteLocalDateTime(value: string): boolean {
	return parseLocalDateTime(value) !== null;
}

function partsAsUtc(parts: LocalDateTimeParts): number {
	return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function matchingParts(left: LocalDateTimeParts, right: LocalDateTimeParts): boolean {
	return (
		left.year === right.year &&
		left.month === right.month &&
		left.day === right.day &&
		left.hour === right.hour &&
		left.minute === right.minute
	);
}

function padded(value: number): string {
	return String(value).padStart(2, '0');
}

export function isValidIanaTimeZone(value: string): boolean {
	return formatterFor(value) !== null;
}

/** Converts a datetime in a selected IANA zone to a Unix-millisecond timestamp. */
export function zonedDateTimeToUnixMilliseconds(value: string, timeZone: string): number | null {
	const desired = parseLocalDateTime(value);
	if (!desired || !isValidIanaTimeZone(timeZone)) {
		return null;
	}

	let timestamp = partsAsUtc(desired);
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const actual = localParts(timestamp, timeZone);
		if (!actual) {
			return null;
		}
		if (matchingParts(actual, desired)) {
			return timestamp;
		}
		timestamp += partsAsUtc(desired) - partsAsUtc(actual);
	}

	const actual = localParts(timestamp, timeZone);
	return actual && matchingParts(actual, desired) ? timestamp : null;
}

export function formatTimestampForTimeZoneInput(timestamp: number, timeZone: string): string | null {
	if (!Number.isSafeInteger(timestamp) || !isValidIanaTimeZone(timeZone)) {
		return null;
	}

	const parts = localParts(timestamp, timeZone);
	return parts
		? `${parts.year}-${padded(parts.month)}-${padded(parts.day)}T${padded(parts.hour)}:${padded(parts.minute)}`
		: null;
}

/** Keeps a complete local datetime at or after the Unix epoch in its selected zone. */
export function clampLocalDateTimeToUnixEpoch(value: string, timeZone: string): string {
	const timestamp = zonedDateTimeToUnixMilliseconds(value, timeZone);
	return timestamp !== null && !isOnOrAfterUnixEpoch(timestamp)
		? (formatTimestampForTimeZoneInput(unixEpochMilliseconds, timeZone) ?? value)
		: value;
}
