import { z } from 'zod';
import configuredTimeZonesSource from './time-zones.json';

const configuredTimeZoneSchema = z.strictObject({
	aliases: z.array(z.string().trim().min(1)),
	places: z.array(z.string().trim().min(1)),
	timeZone: z.string().trim().min(1)
});

export type TimeZoneSearchOption = Readonly<{
	aliases: string[];
	places: string[];
	timeZone: string;
}>;

const configuredTimeZones = z.array(configuredTimeZoneSchema).parse(configuredTimeZonesSource);
const configuredTimeZoneOptions = new Map(
	configuredTimeZones.map((timeZone) => [
		timeZone.timeZone,
		{
			aliases: timeZone.aliases,
			places: timeZone.places,
			timeZone: timeZone.timeZone
		}
	])
);
let browserOptions: TimeZoneSearchOption[] | undefined;

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
			availableTimeZones = [...configuredTimeZoneOptions.keys()];
		}

		return [...new Set([...availableTimeZones, ...configuredTimeZoneOptions.keys()])].map(
			(timeZone) =>
				configuredTimeZoneOptions.get(timeZone) ?? {
					aliases: [],
					places: [derivedPlace(timeZone)],
					timeZone
				}
		);
	})();

	return browserOptions;
}

export function timeZoneShortLabel(timeZone: string): string {
	return configuredTimeZoneOptions.get(timeZone)?.aliases[0] ?? timeZone;
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
				[option.timeZone, ...option.aliases, ...option.places].some((value) =>
					normalized(value).includes(query)
				)
			)
		: options;

	return [...matches]
		.sort(
			(left, right) =>
				searchScore(left, query) - searchScore(right, query) ||
				left.timeZone.localeCompare(right.timeZone)
		)
		.slice(0, limit);
}
