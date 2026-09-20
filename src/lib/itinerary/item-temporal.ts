import {
	currentOrNextAvailabilityConstraint,
	isOpeningHoursPeriodConstraint,
	latestAvailabilityConstraint
} from './availability';
import type {
	AvailabilityConstraint,
	ItineraryItem,
	ItineraryItemPlacement,
	ItineraryTiming,
	TransportDetails
} from './schema';
import { formatLocalTimestamp, formatTimestampInTimeZone } from './time';
import { timingEarliestTimestamp, timingEndTimestamp, timingStartTimestamp } from './timing';

/** The temporal fields common to persisted and access-projected itinerary items. */
export type ItemTemporalFields = Readonly<{
	availability?: readonly AvailabilityConstraint[];
	placement?: ItineraryItemPlacement;
	timing?: ItineraryTiming;
}>;

/** A transport item may be projected without its service details. */
export type ItemWithTemporalSources = ItemTemporalFields &
	Readonly<{
		transport?: Pick<TransportDetails, 'stops'>;
		type: ItineraryItem['type'];
	}>;

export type ItemPlanTemporalSource = Readonly<{
	source: 'plan';
	timing: ItineraryTiming;
}>;

export type ItemPlacementTemporalSource = Readonly<{
	placement: ItineraryItemPlacement;
	source: 'placement';
}>;

export type ItemServiceTemporalSource = Readonly<{
	at: number;
	role: 'transport-stop';
	source: 'service';
	stopIndex: number;
	timeZone: string;
}>;

export type ItemAvailabilityTemporalSource = Readonly<{
	constraint: AvailabilityConstraint;
	source: 'availability';
}>;

/**
 * Persisted fields represented as their distinct temporal meanings. This deliberately returns
 * every available source; it does not choose one timestamp to stand in for the others.
 */
export type ItemTemporalSource =
	ItemPlanTemporalSource | ItemPlacementTemporalSource | ItemServiceTemporalSource | ItemAvailabilityTemporalSource;

export function resolveItemPlanTemporalSource(item: ItemTemporalFields): ItemPlanTemporalSource | undefined {
	return item.timing === undefined ? undefined : { source: 'plan', timing: item.timing };
}

export function resolveItemPlacementTemporalSource(item: ItemTemporalFields): ItemPlacementTemporalSource | undefined {
	return item.placement === undefined ? undefined : { placement: item.placement, source: 'placement' };
}

export function resolveItemAvailabilityTemporalSources(item: ItemTemporalFields): ItemAvailabilityTemporalSource[] {
	return (item.availability ?? []).map((constraint) => ({ constraint, source: 'availability' }));
}

/** Returns an explicitly published transport-stop time, never an inferred item Plan. */
export function resolveTransportStopServiceTemporalSource(
	stop: TransportDetails['stops'][number],
	stopIndex: number,
	defaultTimeZone: string
): ItemServiceTemporalSource | undefined {
	if (stop.scheduledAt === undefined) {
		return undefined;
	}
	return {
		at: stop.scheduledAt,
		role: 'transport-stop',
		source: 'service',
		stopIndex,
		timeZone: stop.timeZone ?? defaultTimeZone
	};
}

export type TransportStopTemporalPresentation =
	| ItemServiceTemporalSource
	| (ItemPlanTemporalSource &
			Readonly<{
				at: number;
				role: 'transport-stop';
				stopIndex: number;
				timeZone: string;
			}>);

/**
 * Chooses the temporal source shown at one transport stop. An explicit service time wins;
 * otherwise the journey Plan is shown only for an untimed first stop.
 */
export function resolveTransportStopTemporalPresentation(
	timing: ItineraryTiming | undefined,
	stop: TransportDetails['stops'][number],
	stopIndex: number,
	defaultTimeZone: string
): TransportStopTemporalPresentation | undefined {
	const planTimeZone = timing?.timeZone ?? defaultTimeZone;
	const service = resolveTransportStopServiceTemporalSource(stop, stopIndex, planTimeZone);
	if (service) {
		return service;
	}
	if (timing === undefined || stopIndex !== 0) {
		return undefined;
	}
	return {
		at: timingStartTimestamp(timing),
		role: 'transport-stop',
		source: 'plan',
		stopIndex,
		timeZone: planTimeZone,
		timing
	};
}

function itemSourceTimeZone(item: ItemTemporalFields, tripTimeZone: string): string {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		return plan.timing.timeZone ?? tripTimeZone;
	}
	return resolveItemPlacementTemporalSource(item)?.placement.timeZone ?? tripTimeZone;
}

/** Returns every explicit transport service time, in stop order. */
export function resolveItemServiceTemporalSources(
	item: ItemWithTemporalSources,
	tripTimeZone: string
): ItemServiceTemporalSource[] {
	if (item.type !== 'transport' || item.transport === undefined) {
		return [];
	}

	const defaultTimeZone = itemSourceTimeZone(item, tripTimeZone);
	const sources: ItemServiceTemporalSource[] = [];
	for (const [stopIndex, stop] of item.transport.stops.entries()) {
		const source = resolveTransportStopServiceTemporalSource(stop, stopIndex, defaultTimeZone);
		if (source) {
			sources.push(source);
		}
	}
	return sources;
}

/** Returns all temporal sources without assigning cross-source priority. */
export function resolveItemTemporalSources(item: ItemWithTemporalSources, tripTimeZone: string): ItemTemporalSource[] {
	const plan = resolveItemPlanTemporalSource(item);
	const placement = resolveItemPlacementTemporalSource(item);
	return [
		...(plan ? [plan] : []),
		...(placement ? [placement] : []),
		...resolveItemServiceTemporalSources(item, tripTimeZone),
		...resolveItemAvailabilityTemporalSources(item)
	];
}

export type DayCardPrimaryTemporalSource =
	ItemPlanTemporalSource | ItemServiceTemporalSource | ItemAvailabilityTemporalSource;

export type DayCardTemporalContext = Readonly<{
	availabilityTimestamp: number;
	tripTimeZone: string;
}>;

function resolveDayCardOpeningHoursSource(
	item: ItemTemporalFields,
	availabilityTimestamp: number
): ItemAvailabilityTemporalSource | undefined {
	const openingHours = resolveItemAvailabilityTemporalSources(item)
		.map((source) => source.constraint)
		.filter(isOpeningHoursPeriodConstraint);
	const constraint =
		currentOrNextAvailabilityConstraint(openingHours, availabilityTimestamp)?.constraint ??
		latestAvailabilityConstraint(openingHours);
	return constraint ? { constraint, source: 'availability' } : undefined;
}

/**
 * Returns a day card's temporal candidates in display priority. Placement is intentionally absent
 * because its anchor is calendar membership, not a displayed time. Availability remains ahead of
 * a first-stop service time, while leaving the UI able to skip an unpresentable availability label.
 */
export function resolveDayCardTemporalCandidates(
	item: ItemWithTemporalSources,
	context: DayCardTemporalContext
): readonly DayCardPrimaryTemporalSource[] {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		return [plan];
	}

	const availability = resolveDayCardOpeningHoursSource(item, context.availabilityTimestamp);
	const service = resolveItemServiceTemporalSources(item, context.tripTimeZone).find(
		(source) => source.stopIndex === 0
	);
	return [...(availability ? [availability] : []), ...(service ? [service] : [])];
}

/** Returns the first source a day card normally displays. */
export function resolveDayCardPrimaryTemporalSource(
	item: ItemWithTemporalSources,
	context: DayCardTemporalContext
): DayCardPrimaryTemporalSource | undefined {
	return resolveDayCardTemporalCandidates(item, context)[0];
}

/** Supplies a day anchor only as date-formatting context for a day-card availability label. */
export function resolveDayCardAvailabilityContextTimestamps(item: ItemTemporalFields): readonly number[] {
	const placement = resolveItemPlacementTemporalSource(item);
	return placement ? [placement.placement.anchorAt] : [];
}

function timestampForContext(timestamp: number, timeZone: string | undefined) {
	return timeZone ? formatTimestampInTimeZone(timestamp, timeZone) : formatLocalTimestamp(timestamp);
}

function localDateForTimestamp(timestamp: number, timeZone: string | undefined): string {
	const formatted = timestampForContext(timestamp, timeZone);
	if (!formatted) {
		throw new Error(`Item timestamp ${timestamp} cannot be localized.`);
	}
	return formatted.date;
}

function timingDateBounds(timing: ItineraryTiming, timeZone: string | undefined): readonly [string, string] {
	return [
		localDateForTimestamp(timingEarliestTimestamp(timing), timeZone),
		localDateForTimestamp(timingEndTimestamp(timing), timeZone)
	];
}

/** Returns the local calendar date of the intended Plan start. */
export function resolvePlanStartDate(timing: ItineraryTiming, timeZone?: string): string {
	return localDateForTimestamp(timingStartTimestamp(timing), timeZone);
}

export type ItemCalendarDayMembership =
	| (ItemPlanTemporalSource &
			Readonly<{
				endDate: string;
				startDate: string;
			}>)
	| (ItemPlacementTemporalSource &
			Readonly<{
				endDate: string;
				startDate: string;
			}>);

/**
 * Resolves the calendar days an item belongs to. A placement's neutral anchor is used only to
 * recover its local calendar day; it never establishes chronological position.
 */
export function resolveItemCalendarDayMembership(
	item: ItemTemporalFields,
	timeZone?: string
): ItemCalendarDayMembership | undefined {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		const [startDate, endDate] = timingDateBounds(plan.timing, timeZone);
		return { ...plan, endDate, startDate };
	}

	const placement = resolveItemPlacementTemporalSource(item);
	if (!placement) {
		return undefined;
	}
	const date = localDateForTimestamp(placement.placement.anchorAt, timeZone);
	return { ...placement, endDate: date, startDate: date };
}

export type ItemDayChronologicalPosition = ItemPlanTemporalSource &
	Readonly<{
		at: number;
	}>;

/**
 * Resolves an item's chronological position for a displayed calendar day. Only Plan supplies
 * one: availability, service stops, and placement do not alter the itinerary day order.
 */
export function resolveItemDayChronologicalPosition(
	item: ItemTemporalFields,
	date: string,
	timeZone?: string
): ItemDayChronologicalPosition | undefined {
	const plan = resolveItemPlanTemporalSource(item);
	if (!plan) {
		return undefined;
	}
	const [startDate, endDate] = timingDateBounds(plan.timing, timeZone);
	return {
		...plan,
		at: date === endDate && startDate !== endDate ? timingEndTimestamp(plan.timing) : timingStartTimestamp(plan.timing)
	};
}

export type NowNextCandidateTemporalSource = ItemPlanTemporalSource | ItemAvailabilityTemporalSource;

/**
 * Resolves eligible Now / Next sources. Plan wins for an item; opening hours can be candidates
 * only for an item placed on a day without a Plan. Transport service times remain factual detail,
 * not itinerary Now / Next candidates.
 */
export function resolveNowNextCandidateTemporalSources(item: ItemTemporalFields): NowNextCandidateTemporalSource[] {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		return [plan];
	}
	if (!resolveItemPlacementTemporalSource(item)) {
		return [];
	}
	return resolveItemAvailabilityTemporalSources(item).filter((source) =>
		isOpeningHoursPeriodConstraint(source.constraint)
	);
}

export type ItemDetailTemporalPresentation =
	| Readonly<{
			availabilityContextTimestamps: readonly [number, number];
			kind: 'plan';
			source: ItemPlanTemporalSource;
	  }>
	| Readonly<{
			availabilityContextTimestamps: readonly [number];
			kind: 'placement';
			source: ItemPlacementTemporalSource;
	  }>
	| Readonly<{
			availabilityContextTimestamps: readonly [];
			kind: 'none';
	  }>;

/**
 * Chooses the temporal source for an item's detail Schedule/Day boundary. Service and
 * availability remain separately presented factual and constraint information; placement is
 * presented only as a day, never as a time.
 */
export function resolveItemDetailTemporalPresentation(item: ItemTemporalFields): ItemDetailTemporalPresentation {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		return {
			availabilityContextTimestamps: [timingStartTimestamp(plan.timing), timingEndTimestamp(plan.timing)],
			kind: 'plan',
			source: plan
		};
	}

	const placement = resolveItemPlacementTemporalSource(item);
	if (placement) {
		return {
			availabilityContextTimestamps: [placement.placement.anchorAt],
			kind: 'placement',
			source: placement
		};
	}

	return { availabilityContextTimestamps: [], kind: 'none' };
}
