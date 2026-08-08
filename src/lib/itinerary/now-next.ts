import type { ItineraryTiming } from './schema';
import { timingStartTimestamp } from './timing';

type TimedItem = Readonly<{
	id: string;
	timing: ItineraryTiming;
}>;

export type NowNextState<Item extends TimedItem> =
	| Readonly<{ kind: 'empty' }>
	| Readonly<{ kind: 'before-trip'; daysUntilStart: number; nextItem: Item }>
	| Readonly<{ kind: 'between-items'; previousItem: Item; nextItem: Item }>
	| Readonly<{ kind: 'exact-current'; currentItem: Item; nextItem?: Item }>
	| Readonly<{ kind: 'window-active'; currentItem: Item; nextItem?: Item }>
	| Readonly<{ kind: 'next-only'; nextItem: Item }>
	| Readonly<{ kind: 'complete' }>;

const millisecondsPerDay = 86_400_000;

function timingEndTimestamp(timing: ItineraryTiming): number {
	switch (timing.kind) {
		case 'exact':
			return timing.endAt ?? timing.startAt;
		case 'approximate':
			return timing.nominalAt + timing.toleranceMinutes * 60_000;
		case 'window':
			return timing.latestAt;
	}
}

function timingIsActive(timing: ItineraryTiming, currentTimestamp: number): boolean {
	return (
		timing.kind !== 'approximate' &&
		timingStartTimestamp(timing) <= currentTimestamp &&
		currentTimestamp <= timingEndTimestamp(timing)
	);
}

function timingIsPossiblyActive(timing: ItineraryTiming, currentTimestamp: number): boolean {
	if (timing.kind !== 'approximate') {
		return false;
	}

	const toleranceMilliseconds = timing.toleranceMinutes * 60_000;
	return (
		timing.nominalAt - toleranceMilliseconds <= currentTimestamp &&
		currentTimestamp <= timing.nominalAt + toleranceMilliseconds
	);
}

function timingIsPast(timing: ItineraryTiming, currentTimestamp: number): boolean {
	return timingEndTimestamp(timing) < currentTimestamp;
}

function compareTimedItems<Item extends TimedItem>(left: Item, right: Item): number {
	return timingStartTimestamp(left.timing) - timingStartTimestamp(right.timing) || left.id.localeCompare(right.id);
}

function latestActiveItem<Item extends TimedItem>(items: Item[], currentTimestamp: number): Item | undefined {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item && timingIsActive(item.timing, currentTimestamp)) {
			return item;
		}
	}
	return undefined;
}

function firstPossiblyActiveItem<Item extends TimedItem>(items: Item[], currentTimestamp: number): Item | undefined {
	return items.find((item) => timingIsPossiblyActive(item.timing, currentTimestamp));
}

function latestPastItem<Item extends TimedItem>(items: Item[], currentTimestamp: number): Item | undefined {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item && timingIsPast(item.timing, currentTimestamp)) {
			return item;
		}
	}
	return undefined;
}

function followingItem<Item extends TimedItem>(items: Item[], currentItem: Item): Item | undefined {
	const currentIndex = items.findIndex((item) => item.id === currentItem.id);
	return currentIndex === -1 ? undefined : items[currentIndex + 1];
}

/**
 * Selects an honest Now / Next presentation state for an ordered trip timeline.
 * Approximate timings are never treated as definitely current.
 */
export function getNowNextState<Item extends TimedItem>(items: Item[], currentTimestamp: number): NowNextState<Item> {
	const orderedItems = [...items].sort(compareTimedItems);
	const firstItem = orderedItems[0];
	if (!firstItem) {
		return { kind: 'empty' };
	}

	const activeItem = latestActiveItem(orderedItems, currentTimestamp);
	if (activeItem) {
		const nextItem = followingItem(orderedItems, activeItem);
		return activeItem.timing.kind === 'exact'
			? {
					kind: 'exact-current',
					currentItem: activeItem,
					...(nextItem ? { nextItem } : {})
				}
			: {
					kind: 'window-active',
					currentItem: activeItem,
					...(nextItem ? { nextItem } : {})
				};
	}

	const possiblyActiveItem = firstPossiblyActiveItem(orderedItems, currentTimestamp);
	if (possiblyActiveItem) {
		return { kind: 'next-only', nextItem: possiblyActiveItem };
	}

	const previousItem = latestPastItem(orderedItems, currentTimestamp);
	const nextItem = orderedItems.find((item) => !timingIsPast(item.timing, currentTimestamp));
	if (!previousItem && nextItem) {
		return {
			kind: 'before-trip',
			daysUntilStart: Math.ceil((timingStartTimestamp(nextItem.timing) - currentTimestamp) / millisecondsPerDay),
			nextItem
		};
	}
	if (previousItem && nextItem) {
		return { kind: 'between-items', previousItem, nextItem };
	}
	if (nextItem) {
		return { kind: 'next-only', nextItem };
	}
	return { kind: 'complete' };
}
