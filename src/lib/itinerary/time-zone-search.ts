import { rawTimeZones, timeZonesNames } from '@vvo/tzdb';

export type TimeZoneSearchOption = Readonly<{
	aliases: string[];
	places: string[];
	timeZone: string;
}>;

const utcTimeZoneOption: TimeZoneSearchOption = {
	aliases: ['UTC', 'GMT'],
	places: ['Coordinated Universal Time'],
	timeZone: 'UTC'
};

const timeZoneOptionsByName = new Map<string, TimeZoneSearchOption>([['UTC', utcTimeZoneOption]]);

for (const timeZone of rawTimeZones) {
	const option = {
		aliases: [timeZone.abbreviation, timeZone.alternativeName],
		places: timeZone.mainCities,
		timeZone: timeZone.name
	};
	for (const name of timeZone.group) {
		if (!timeZoneOptionsByName.has(name)) {
			timeZoneOptionsByName.set(name, { ...option, timeZone: name });
		}
	}
}

let browserOptions: TimeZoneSearchOption[] | undefined;
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const shortNameFormatters = new Map<string, Intl.DateTimeFormat>();
const timeZoneNameLocales = ['en-AU', 'en-US', 'en-GB'] as const;
const shortTimeZoneNamePattern = /^[A-Z]{2,5}$/;

function derivedPlace(timeZone: string): string {
	return timeZone
		.split('/')
		.reverse()
		.map((part) => part.replaceAll('_', ' '))
		.join(', ');
}

export function browserTimeZoneOptions(): TimeZoneSearchOption[] {
	browserOptions ??= (() => {
		let availableTimeZones: string[];

		try {
			availableTimeZones = Intl.supportedValuesOf('timeZone');
		} catch {
			availableTimeZones = timeZonesNames;
		}

		return [...new Set(['UTC', ...availableTimeZones])].map(
			(timeZone) =>
				timeZoneOptionsByName.get(timeZone) ?? {
					aliases: [],
					places: [derivedPlace(timeZone)],
					timeZone
				}
		);
	})();

	return browserOptions;
}

function offsetFormatterFor(timeZone: string): Intl.DateTimeFormat {
	const existing = offsetFormatters.get(timeZone);
	if (existing) {
		return existing;
	}

	const formatter = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' });
	offsetFormatters.set(timeZone, formatter);
	return formatter;
}

function shortNameFormatterFor(locale: (typeof timeZoneNameLocales)[number], timeZone: string): Intl.DateTimeFormat {
	const key = `${locale}:${timeZone}`;
	const existing = shortNameFormatters.get(key);
	if (existing) {
		return existing;
	}

	const formatter = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' });
	shortNameFormatters.set(key, formatter);
	return formatter;
}

function timeZoneAbbreviationAt(timeZone: string, timestamp: number): string | null {
	if (!Number.isSafeInteger(timestamp)) {
		return null;
	}

	try {
		for (const locale of timeZoneNameLocales) {
			const abbreviation = shortNameFormatterFor(locale, timeZone)
				.formatToParts(new Date(timestamp))
				.find((part) => part.type === 'timeZoneName')?.value;
			if (
				abbreviation &&
				abbreviation !== 'GMT' &&
				abbreviation !== 'UTC' &&
				shortTimeZoneNamePattern.test(abbreviation)
			) {
				return abbreviation;
			}
		}
		return null;
	} catch {
		return null;
	}
}

/** Returns the exact UTC offset at a timestamp for compact display and tooltips. */
export function timeZoneOffsetLabel(timeZone: string, timestamp: number): string | null {
	if (!Number.isSafeInteger(timestamp)) {
		return null;
	}

	try {
		const offset = offsetFormatterFor(timeZone)
			.formatToParts(new Date(timestamp))
			.find((part) => part.type === 'timeZoneName')?.value;
		if (!offset) {
			return null;
		}
		return offset === 'GMT' || offset === 'GMT+00:00' ? 'UTC' : offset.replace(/^GMT/, 'UTC');
	} catch {
		return null;
	}
}

export function timeZoneShortLabel(timeZone: string, timestamp = Date.now()): string {
	return (
		timeZoneAbbreviationAt(timeZone, timestamp) ??
		timeZoneOptionsByName.get(timeZone)?.aliases[0] ??
		timeZoneOffsetLabel(timeZone, timestamp) ??
		timeZone
	);
}

function normalized(value: string): string {
	return value.trim().toLowerCase();
}

function searchScore(option: TimeZoneSearchOption, query: string): number {
	if (option.aliases.some((alias) => normalized(alias) === query)) {
		return 0;
	}
	if (normalized(option.timeZone) === query) {
		return 1;
	}
	if (option.aliases.some((alias) => normalized(alias).startsWith(query))) {
		return 2;
	}
	if (normalized(option.timeZone).startsWith(query)) {
		return 3;
	}
	return 4;
}

export function searchTimeZoneOptions(
	options: TimeZoneSearchOption[],
	queryInput: string,
	limit = 12
): TimeZoneSearchOption[] {
	const query = normalized(queryInput);
	const matches = query
		? options.filter((option) =>
				[option.timeZone, ...option.aliases, ...option.places].some((value) => normalized(value).includes(query))
			)
		: options;

	return [...matches]
		.sort(
			(left, right) =>
				searchScore(left, query) - searchScore(right, query) || left.timeZone.localeCompare(right.timeZone)
		)
		.slice(0, limit);
}
