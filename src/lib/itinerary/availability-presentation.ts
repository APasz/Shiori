import { defaultFormatPreferences, formatTime, type FormatPreferences } from '$lib/format-preferences';
import { formatCalendarDate, type CalendarDateFormat, type CalendarLocale } from './calendar';
import { availabilityTimingKindLabels, availabilityTypePresentationLabel } from './availability';
import type { Constraint, ConstraintTiming } from './schema';
import { formatTimestampInTimeZone, type FormattedLocalTimestamp } from './time';

export type AvailabilityPresentationConstraint = Pick<Constraint, 'label' | 'timing' | 'type'>;

export type AvailabilityPresentationOptions = Readonly<{
	/** The time zone in which the surrounding itinerary timing establishes its dates. */
	contextTimeZone?: string;
	calendarDateFormat?: CalendarDateFormat;
	contextTimestamps?: readonly number[];
	formatPreferences?: FormatPreferences;
	locale?: CalendarLocale;
}>;

export type AvailabilityPresentation = Readonly<{
	label: string;
	timeZone: string;
	timing: string;
	timestamp: number;
}>;

const emptyContextDates: ReadonlySet<string> = new Set();

function formattedDate(timestamp: FormattedLocalTimestamp, options: AvailabilityPresentationOptions): string {
	return (
		formatCalendarDate(
			timestamp.date,
			options.calendarDateFormat ?? 'date',
			options.locale ?? null,
			options.formatPreferences?.dateFormat ?? defaultFormatPreferences.dateFormat
		) ?? timestamp.date
	);
}

function formattedTime(timestamp: FormattedLocalTimestamp, options: AvailabilityPresentationOptions): string {
	return formatTime(timestamp.time, options.formatPreferences?.timeFormat ?? defaultFormatPreferences.timeFormat);
}

function timestampLabel(
	timestamp: FormattedLocalTimestamp,
	includeDate: boolean,
	options: AvailabilityPresentationOptions
): string {
	const time = formattedTime(timestamp, options);
	return includeDate ? `${formattedDate(timestamp, options)}, ${time}` : time;
}

function contextDates(timeZone: string, options: AvailabilityPresentationOptions): ReadonlySet<string> {
	if (options.contextTimeZone !== timeZone) {
		return emptyContextDates;
	}

	const dates = new Set<string>();
	for (const timestamp of options.contextTimestamps ?? []) {
		const formatted = formatTimestampInTimeZone(timestamp, timeZone);
		if (formatted) {
			dates.add(formatted.date);
		}
	}
	return dates;
}

function formatPeriodTiming(
	timing: Extract<ConstraintTiming, { kind: 'period' }>,
	options: AvailabilityPresentationOptions
): string | null {
	const start = formatTimestampInTimeZone(timing.startAt, timing.timeZone);
	const end = formatTimestampInTimeZone(timing.endAt, timing.timeZone);
	if (!start || !end) {
		return null;
	}

	const contextualDates = contextDates(timing.timeZone, options);
	if (start.date === end.date) {
		const date = contextualDates.has(start.date) ? '' : `${formattedDate(start, options)}, `;
		return `${date}${formattedTime(start, options)}–${formattedTime(end, options)}`;
	}

	const includeStartDate = !contextualDates.has(start.date);
	let includeEndDate = !contextualDates.has(end.date);
	if (!includeStartDate && !includeEndDate) {
		includeEndDate = true;
	}
	return `${timestampLabel(start, includeStartDate, options)} – ${timestampLabel(end, includeEndDate, options)}`;
}

/** Returns the concise semantic label unless an entry has an explicit custom label. */
export function availabilityConstraintLabel(
	constraint: Pick<AvailabilityPresentationConstraint, 'label' | 'type'>
): string {
	return constraint.label ?? availabilityTypePresentationLabel(constraint.type);
}

/** Formats a timing in its saved availability time zone, using dates only where the surrounding item does not establish them. */
export function formatAvailabilityConstraintTiming(
	timing: ConstraintTiming,
	options: AvailabilityPresentationOptions = {}
): string | null {
	if (timing.kind === 'period') {
		return formatPeriodTiming(timing, options);
	}

	const timestamp = formatTimestampInTimeZone(timing.at, timing.timeZone);
	if (!timestamp) {
		return null;
	}
	return `${availabilityTimingKindLabels[timing.kind]} ${timestampLabel(
		timestamp,
		!contextDates(timing.timeZone, options).has(timestamp.date),
		options
	)}`;
}

/** Builds the display data for one availability entry without treating it as itinerary timing. */
export function availabilityConstraintPresentation(
	constraint: AvailabilityPresentationConstraint,
	options: AvailabilityPresentationOptions = {}
): AvailabilityPresentation | null {
	const timing = formatAvailabilityConstraintTiming(constraint.timing, options);
	if (timing === null) {
		return null;
	}

	return {
		label: availabilityConstraintLabel(constraint),
		timeZone: constraint.timing.timeZone,
		timing,
		timestamp: constraint.timing.kind === 'period' ? constraint.timing.startAt : constraint.timing.at
	};
}
