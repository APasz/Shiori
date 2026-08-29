export const dateFormatValues = ['locale', 'day-month-year', 'month-day-year', 'year-month-day'] as const;
export const timeFormatValues = ['twelve-hour', 'twenty-four-hour'] as const;

export type DateFormat = (typeof dateFormatValues)[number];
export type TimeFormat = (typeof timeFormatValues)[number];
export type FormatPreferences = Readonly<{
	dateFormat: DateFormat;
	timeFormat: TimeFormat;
}>;

type FormatOption<Value extends string> = Readonly<{
	label: string;
	value: Value;
}>;

export const dateFormatOptions = [
	{ label: 'Use my locale', value: 'locale' },
	{ label: 'DD-MM-YYYY', value: 'day-month-year' },
	{ label: 'MM-DD-YYYY', value: 'month-day-year' },
	{ label: 'YYYY-MM-DD', value: 'year-month-day' }
] as const satisfies readonly FormatOption<DateFormat>[];

export const timeFormatOptions = [
	{ label: '24-hour (14:30)', value: 'twenty-four-hour' },
	{ label: '12-hour (2:30 pm)', value: 'twelve-hour' }
] as const satisfies readonly FormatOption<TimeFormat>[];

export const defaultFormatPreferences: FormatPreferences = {
	dateFormat: 'locale',
	timeFormat: 'twenty-four-hour'
};

const canonicalTimePattern = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/;

/** Formats a canonical 24-hour time for the selected display convention. */
export function formatTime(value: string, format: TimeFormat = defaultFormatPreferences.timeFormat): string {
	if (format === 'twenty-four-hour') {
		return value;
	}

	const matched = canonicalTimePattern.exec(value);
	if (!matched?.groups) {
		return value;
	}

	const hour = Number(matched.groups.hour);
	const displayHour = hour % 12 || 12;
	const period = hour < 12 ? 'am' : 'pm';
	return `${displayHour}:${matched.groups.minute} ${period}`;
}
