import {
	IconActivity,
	IconArrowLeft,
	IconArrowRight,
	IconBed,
	IconBus,
	IconCalendar,
	IconCar,
	IconChevronDown,
	IconChevronLeft,
	IconChevronRight,
	IconDirection,
	IconDeviceDesktop,
	IconDots,
	IconFerry,
	IconMoon,
	IconPlane,
	IconRoute,
	IconSun,
	IconTrain,
	IconWalk
} from '@tabler/icons-svelte';
import { visualAsset, type VisualAsset, type VisualRenderer } from './types';

/** Intent-based icon names used by interface controls. */
export const iconNames = [
	'back',
	'forward',
	'previous',
	'next',
	'disclosure',
	'calendar',
	'lightTheme',
	'darkTheme',
	'systemTheme',
	'more',
	'direction'
] as const;

export type IconName = (typeof iconNames)[number];

/** Decorative artwork names used for itinerary items. */
export const artworkNames = [
	'activity',
	'accommodation',
	'air',
	'bus',
	'car',
	'ferry',
	'rail',
	'route',
	'walk'
] as const;

export type ArtworkName = (typeof artworkNames)[number];

type TablerRenderer = typeof IconActivity;

/** Adapts Tabler's component declaration to the provider-neutral renderer contract. */
function tablerAsset(renderer: TablerRenderer): VisualAsset<'tabler'> {
	return visualAsset('tabler', renderer as unknown as VisualRenderer);
}

/**
 * The application's single visual registry. Semantic names deliberately avoid
 * provider names, so a source can be replaced or mixed without touching callers.
 */
export const iconAssets = {
	back: tablerAsset(IconArrowLeft),
	forward: tablerAsset(IconArrowRight),
	previous: tablerAsset(IconChevronLeft),
	next: tablerAsset(IconChevronRight),
	disclosure: tablerAsset(IconChevronDown),
	calendar: tablerAsset(IconCalendar),
	lightTheme: tablerAsset(IconSun),
	darkTheme: tablerAsset(IconMoon),
	systemTheme: tablerAsset(IconDeviceDesktop),
	more: tablerAsset(IconDots),
	direction: tablerAsset(IconDirection)
} as const satisfies Record<IconName, VisualAsset>;

export const artworkAssets = {
	activity: tablerAsset(IconActivity),
	accommodation: tablerAsset(IconBed),
	air: tablerAsset(IconPlane),
	bus: tablerAsset(IconBus),
	car: tablerAsset(IconCar),
	ferry: tablerAsset(IconFerry),
	rail: tablerAsset(IconTrain),
	route: tablerAsset(IconRoute),
	walk: tablerAsset(IconWalk)
} as const satisfies Record<ArtworkName, VisualAsset>;
