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
const offsetStyleTimeZoneNamePattern = /^(?:(?:GMT|UTC)?[+-]\d{1,2}(?::?\d{2})?|GMT|UTC)$/;

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

/** Returns the exact offset at a timestamp for compact display and tooltips. */
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
		return offset === 'GMT' || offset === 'UTC' || offset === 'GMT+00:00' || offset === 'UTC+00:00'
			? 'UTC'
			: offset.replace(/^(?:GMT|UTC)/, '');
	} catch {
		return null;
	}
}

export function timeZoneShortLabel(timeZone: string, timestamp = Date.now()): string {
	const browserAbbreviation = timeZoneAbbreviationAt(timeZone, timestamp);
	if (browserAbbreviation) {
		return browserAbbreviation;
	}

	const databaseAbbreviation = timeZoneOptionsByName.get(timeZone)?.aliases[0];
	if (databaseAbbreviation && !offsetStyleTimeZoneNamePattern.test(databaseAbbreviation)) {
		return databaseAbbreviation;
	}

	const offset = timeZoneOffsetLabel(timeZone, timestamp);
	if (offset) {
		return offset;
	}
	if (!databaseAbbreviation) {
		return timeZone;
	}
	return databaseAbbreviation === 'GMT' || databaseAbbreviation === 'UTC'
		? 'UTC'
		: databaseAbbreviation.replace(/^(?:GMT|UTC)/, '');
}

/** Returns a concise, human-readable label for a selectable time zone. */
export function timeZoneSelectionLabel(
	timeZone: string,
	options: readonly TimeZoneSearchOption[],
	timestamp = Date.now()
): string {
	if (timeZone === 'UTC') {
		return 'UTC';
	}

	const option = options.find((candidate) => candidate.timeZone === timeZone);
	const identifierPlace = timeZone.split('/').at(-1)?.replaceAll('_', ' ');
	const matchingPlace = option?.places.find((candidate) => candidate === identifierPlace);
	const solePlace = option?.places.length === 1 ? option?.places[0] : undefined;
	const place = matchingPlace ?? solePlace ?? identifierPlace ?? option?.places[0] ?? derivedPlace(timeZone);
	const abbreviation = timeZoneShortLabel(timeZone, timestamp);
	const offset = timeZoneOffsetLabel(timeZone, timestamp);
	const details = [
		...new Set(
			[abbreviation === timeZone ? null : abbreviation, offset].filter(
				(detail): detail is string => detail !== null && detail !== place
			)
		)
	];

	return [place, ...details].join(' · ');
}

function normalized(value: string): string {
	return value.trim().toLowerCase();
}

enum TimeZoneSearchRank {
	ExactTimeZone = 0,
	ExactAlias = 1,
	ExactTimeZoneSegment = 2,
	TimeZonePrefix = 3,
	TimeZoneSegmentPrefix = 4,
	ExactPlace = 5,
	AliasPrefix = 6,
	PlacePrefix = 7,
	PartialMatch = 8
}

type RankedTimeZoneSearchOption = Readonly<{
	option: TimeZoneSearchOption;
	rank: TimeZoneSearchRank;
}>;

function searchRank(option: TimeZoneSearchOption, query: string): TimeZoneSearchRank | null {
	const timeZone = normalized(option.timeZone);
	const aliases = option.aliases.map(normalized);
	const places = option.places.map(normalized);
	const segments = timeZone.split('/');
	const isMatch =
		timeZone.includes(query) ||
		aliases.some((alias) => alias.includes(query)) ||
		places.some((place) => place.includes(query));
	if (!isMatch) {
		return null;
	}

	if (timeZone === query) {
		return TimeZoneSearchRank.ExactTimeZone;
	}
	if (aliases.includes(query)) {
		return TimeZoneSearchRank.ExactAlias;
	}
	if (segments.includes(query)) {
		return TimeZoneSearchRank.ExactTimeZoneSegment;
	}
	if (timeZone.startsWith(query)) {
		return TimeZoneSearchRank.TimeZonePrefix;
	}
	if (segments.some((segment) => segment.startsWith(query))) {
		return TimeZoneSearchRank.TimeZoneSegmentPrefix;
	}
	if (places.includes(query)) {
		return TimeZoneSearchRank.ExactPlace;
	}
	if (aliases.some((alias) => alias.startsWith(query))) {
		return TimeZoneSearchRank.AliasPrefix;
	}
	if (places.some((place) => place.startsWith(query))) {
		return TimeZoneSearchRank.PlacePrefix;
	}
	return TimeZoneSearchRank.PartialMatch;
}

export function searchTimeZoneOptions(
	options: TimeZoneSearchOption[],
	queryInput: string,
	limit = 12
): TimeZoneSearchOption[] {
	const query = normalized(queryInput);
	const matches: RankedTimeZoneSearchOption[] = [];

	for (const option of options) {
		const rank = query ? searchRank(option, query) : TimeZoneSearchRank.PartialMatch;
		if (rank !== null) {
			matches.push({ option, rank });
		}
	}

	return matches
		.sort((left, right) => left.rank - right.rank || left.option.timeZone.localeCompare(right.option.timeZone))
		.slice(0, limit)
		.map(({ option }) => option);
}
