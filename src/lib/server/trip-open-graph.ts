import { getLocalItineraryDayCount } from '$lib/itinerary/presentation';
import type { Itinerary } from '$lib/itinerary/schema';
import { timingEarliestTimestamp, timingEndTimestamp } from '$lib/itinerary/timing';
import { resolveTimingTimeZone, resolveTransportStopTimeZone } from '$lib/itinerary/time-zone';

const openGraphDateLocale = 'en-AU';
const openGraphDateRangeSeparator = ' >>> ';
const openGraphDateFormatters = new Map<string, Intl.DateTimeFormat>();

type ScheduleBoundary = Readonly<{
	timestamp: number;
	timeZone: string;
}>;

type ScheduleDateRange = Readonly<{
	first: ScheduleBoundary;
	last: ScheduleBoundary;
}>;

export type TripOpenGraphDescriptionSource = Readonly<{
	isPublic: boolean;
	itinerary: Itinerary;
}>;

function openGraphDateFormatter(timeZone: string): Intl.DateTimeFormat {
	const existing = openGraphDateFormatters.get(timeZone);
	if (existing) {
		return existing;
	}

	const formatter = new Intl.DateTimeFormat(openGraphDateLocale, {
		day: 'numeric',
		month: 'short',
		timeZone,
		timeZoneName: 'short',
		year: 'numeric'
	});
	openGraphDateFormatters.set(timeZone, formatter);
	return formatter;
}

function datePart(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
	const value = parts.find((part) => part.type === type)?.value;
	if (!value) {
		throw new Error(`Open Graph date formatting did not provide a ${type} part.`);
	}
	return value;
}

function ordinalDay(day: number): string {
	const finalTwoDigits = day % 100;
	if (finalTwoDigits >= 11 && finalTwoDigits <= 13) {
		return `${day}th`;
	}

	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

function formatScheduleBoundary(boundary: ScheduleBoundary): string {
	const parts = openGraphDateFormatter(boundary.timeZone).formatToParts(boundary.timestamp);
	const day = Number(datePart(parts, 'day'));
	if (!Number.isInteger(day) || day < 1 || day > 31) {
		throw new Error(`Open Graph date formatting returned an invalid day: ${day}.`);
	}

	return `${ordinalDay(day)} ${datePart(parts, 'month')} ${datePart(parts, 'year')} ${datePart(parts, 'timeZoneName')}`;
}

function scheduleDateRange(itinerary: Itinerary): ScheduleDateRange | null {
	let first: ScheduleBoundary | null = null;
	let last: ScheduleBoundary | null = null;
	const consider = (boundary: ScheduleBoundary): void => {
		if (first === null || boundary.timestamp <= first.timestamp) {
			first = boundary;
		}
		if (last === null || boundary.timestamp >= last.timestamp) {
			last = boundary;
		}
	};

	for (const item of itinerary.items) {
		const timingTimeZone = resolveTimingTimeZone(item.timing, itinerary.timeZone);
		consider({ timestamp: timingEarliestTimestamp(item.timing), timeZone: timingTimeZone });
		consider({ timestamp: timingEndTimestamp(item.timing), timeZone: timingTimeZone });

		if (item.type !== 'transport') {
			continue;
		}
		for (const stop of item.transport.stops) {
			if (stop.scheduledAt !== undefined) {
				consider({
					timestamp: stop.scheduledAt,
					timeZone: resolveTransportStopTimeZone(stop, timingTimeZone)
				});
			}
		}
	}

	return first && last ? { first, last } : null;
}

function publicTripDescription(itinerary: Itinerary): string {
	const dayCount = getLocalItineraryDayCount(itinerary.items, itinerary.timeZone);
	const dayLabel = dayCount === 1 ? 'day' : 'days';
	const dateRange = scheduleDateRange(itinerary);
	if (!dateRange) {
		return `Public trip: ${dayCount} ${dayLabel}`;
	}

	return [
		`Public trip: ${dayCount} ${dayLabel}`,
		`${formatScheduleBoundary(dateRange.first)}${openGraphDateRangeSeparator}${formatScheduleBoundary(dateRange.last)}`
	].join('\n');
}

/** Creates the privacy-safe description used when an itinerary link is unfurled. */
export function tripOpenGraphDescription(source: TripOpenGraphDescriptionSource): string {
	return source.isPublic ? publicTripDescription(source.itinerary) : 'Private trip: sign-in required';
}
