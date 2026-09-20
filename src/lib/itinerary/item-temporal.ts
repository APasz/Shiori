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
type TransportTemporalDetails = Readonly<{
	stops: readonly TransportDetails['stops'][number][];
}>;

type ItemWithTransportTemporalFields = ItemTemporalFields &
	Readonly<{
		transport?: TransportTemporalDetails;
	}>;

export type ItemWithTemporalSources = ItemWithTransportTemporalFields &
	Readonly<{
		type: ItineraryItem['type'];
	}>;

/**
 * Day ordering can receive lightweight item projections. A type is needed only when an
 * unplanned transport item's first service time is considered for chronological placement.
 */
export type ItemWithDayOrderingTemporalSources = ItemWithTransportTemporalFields &
	Readonly<{
		type?: ItineraryItem['type'];
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

/** Returns the first transport stop's explicit service time, if that domain source exists. */
function resolveFirstTransportStopServiceTemporalSource(
	item: ItemWithDayOrderingTemporalSources,
	tripTimeZone: string
): ItemServiceTemporalSource | undefined {
	if (item.type !== 'transport') {
		return undefined;
	}
	const stop = item.transport?.stops[0];
	return stop === undefined
		? undefined
		: resolveTransportStopServiceTemporalSource(stop, 0, itemSourceTimeZone(item, tripTimeZone));
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
	const openingHours = (item.availability ?? []).filter(isOpeningHoursPeriodConstraint);
	const constraint =
		currentOrNextAvailabilityConstraint(openingHours, availabilityTimestamp)?.constraint ??
		latestAvailabilityConstraint(openingHours);
	return constraint ? { constraint, source: 'availability' } : undefined;
}

/**
 * Resolves a day card's primary temporal source in display priority: Plan, first-stop service
 * time, then opening-hours availability. Placement is intentionally absent because its anchor is
 * calendar membership, not a displayed time.
 */
export function resolveDayCardPrimaryTemporalSource(
	item: ItemWithTemporalSources,
	context: DayCardTemporalContext
): DayCardPrimaryTemporalSource | undefined {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		return plan;
	}

	const service = resolveFirstTransportStopServiceTemporalSource(item, context.tripTimeZone);
	if (service) {
		return service;
	}

	return resolveDayCardOpeningHoursSource(item, context.availabilityTimestamp);
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

export type ItemDayChronologicalPosition =
	| (ItemPlanTemporalSource &
			Readonly<{
				at: number;
			}>)
	| ItemServiceTemporalSource;

/**
 * Resolves an item's chronological position for a displayed calendar day. Plan always wins.
 * Without a Plan, only an explicit first transport-stop service time on that displayed day can
 * position an item chronologically. Placement establishes membership only, and availability
 * never changes the order.
 */
export function resolveItemDayChronologicalPosition(
	item: ItemWithDayOrderingTemporalSources,
	date: string,
	timeZone?: string
): ItemDayChronologicalPosition | undefined {
	const plan = resolveItemPlanTemporalSource(item);
	if (plan) {
		const [startDate, endDate] = timingDateBounds(plan.timing, timeZone);
		return {
			...plan,
			at:
				date === endDate && startDate !== endDate ? timingEndTimestamp(plan.timing) : timingStartTimestamp(plan.timing)
		};
	}

	const service = resolveFirstTransportStopServiceTemporalSource(item, timeZone ?? 'UTC');
	return service && localDateForTimestamp(service.at, timeZone) === date ? service : undefined;
}

export type NowNextCandidateTemporalSource = ItemPlanTemporalSource | ItemAvailabilityTemporalSource;

/**
 * Resolves eligible Now / Next sources. Plan wins for an item; opening hours can be candidates
 * only for an item placed on a day without a Plan. This is also the explicit policy that an
 * unplanned transport's service departure remains factual detail, not a Now / Next candidate.
 */
export function resolveNowNextCandidateTemporalSources(
	item: ItemWithTemporalSources
): NowNextCandidateTemporalSource[] {
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

export type ItemDetailTemporalSources = Readonly<{
	availability: readonly ItemAvailabilityTemporalSource[];
	availabilityContextTimestamps: readonly number[];
	placement: ItemPlacementTemporalSource | undefined;
	plan: ItemPlanTemporalSource | undefined;
	service: readonly ItemServiceTemporalSource[];
}>;

/**
 * Returns every temporal source applicable to item details. Details intentionally do not choose
 * a winner: Plan, day placement, factual service times, and availability are presented in their
 * own contexts. Placement is still a day anchor, never a displayed time.
 */
export function resolveItemDetailTemporalSources(
	item: ItemWithTemporalSources,
	tripTimeZone: string
): ItemDetailTemporalSources {
	const plan = resolveItemPlanTemporalSource(item);
	const placement = resolveItemPlacementTemporalSource(item);
	return {
		availability: resolveItemAvailabilityTemporalSources(item),
		availabilityContextTimestamps: [
			...(plan ? [timingStartTimestamp(plan.timing), timingEndTimestamp(plan.timing)] : []),
			...(placement ? [placement.placement.anchorAt] : [])
		],
		placement,
		plan,
		service: resolveItemServiceTemporalSources(item, tripTimeZone)
	};
}
