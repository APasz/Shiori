import { defaultDayAnchorAt } from './note-anchor';
import { resolveItemPlanTemporalSource } from './item-temporal';
import type { ItineraryItemPlacement, ItineraryTiming } from './schema';
import { formatTimestampForTimeZoneInput } from './zoned-time';

type ItemWithOptionalTiming = Readonly<{
	placement?: ItineraryItemPlacement;
	timing?: ItineraryTiming;
}>;

export type TimedItem<Item extends ItemWithOptionalTiming> = Item & Readonly<{ timing: ItineraryTiming }>;

/** Narrows an item to one with an actual Schedule, excluding day-only placement anchors. */
export function hasItemTiming<Item extends ItemWithOptionalTiming>(item: Item): item is TimedItem<Item> {
	return resolveItemPlanTemporalSource(item) !== undefined;
}

/** Creates the neutral anchor used to place an unscheduled item on a local calendar day. */
export function itemPlacementAnchorAt(date: string, timeZone: string): number | null {
	return defaultDayAnchorAt(date, timeZone);
}

/** Returns the local calendar day represented by an unscheduled item's anchor. */
export function itemPlacementDate(placement: ItineraryItemPlacement): string | null {
	return formatTimestampForTimeZoneInput(placement.anchorAt, placement.timeZone)?.slice(0, 10) ?? null;
}

/** Retains an existing day anchor when its represented day and zone are unchanged. */
export function itemPlacementAnchorForDate(
	placement: ItineraryItemPlacement | undefined,
	date: string,
	timeZone: string
): number | null {
	if (placement?.timeZone === timeZone && itemPlacementDate(placement) === date) {
		return placement.anchorAt;
	}
	return itemPlacementAnchorAt(date, timeZone);
}
