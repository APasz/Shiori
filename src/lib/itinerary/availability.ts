import type { Constraint, ConstraintTiming, ConstraintType, ItineraryItemType } from './schema';

type ItineraryRecord = Record<string, unknown>;

const availabilityTypeDetails = {
	'opening-hours': { editorLabel: 'Opening hours', presentationLabel: 'Opening' },
	'reception-hours': { editorLabel: 'Reception hours', presentationLabel: 'Reception' },
	'desk-hours': { editorLabel: 'Desk hours', presentationLabel: 'Desk' },
	'storage-hours': { editorLabel: 'Storage hours', presentationLabel: 'Storage' },
	'last-admission': { editorLabel: 'Last admission', presentationLabel: 'Admission' },
	cutoff: { editorLabel: 'Cutoff', presentationLabel: 'Cutoff' },
	other: { editorLabel: 'Other', presentationLabel: 'Other' }
} as const satisfies Record<ConstraintType, Readonly<{ editorLabel: string; presentationLabel: string }>>;

export const availabilityTypeSuggestions = {
	activity: ['opening-hours', 'last-admission', 'desk-hours', 'other'],
	accommodation: ['reception-hours', 'storage-hours', 'desk-hours', 'other'],
	transport: ['desk-hours', 'cutoff', 'storage-hours', 'other']
} as const satisfies Record<ItineraryItemType, readonly ConstraintType[]>;

export function availabilityTypeEditorLabel(type: ConstraintType): string {
	return availabilityTypeDetails[type].editorLabel;
}

export function availabilityTypePresentationLabel(type: ConstraintType): string {
	return availabilityTypeDetails[type].presentationLabel;
}

export type AvailabilityConstraintBounds = Readonly<{
	endAt: number;
	startAt: number;
}>;

export type AvailabilityConstraintSelection<ConstraintValue extends Pick<Constraint, 'timing'> = Constraint> =
	Readonly<{
		constraint: ConstraintValue;
		kind: 'current' | 'next';
	}>;

/** Returns the inclusive instant range used to present an availability constraint. */
export function availabilityConstraintBounds(timing: ConstraintTiming): AvailabilityConstraintBounds {
	return timing.kind === 'period'
		? { endAt: timing.endAt, startAt: timing.startAt }
		: { endAt: timing.at, startAt: timing.at };
}

/** Selects the active constraint, or the nearest future one, without treating it as itinerary timing. */
export function currentOrNextAvailabilityConstraint<ConstraintValue extends Pick<Constraint, 'timing'>>(
	constraints: readonly ConstraintValue[],
	currentTimestamp: number
): AvailabilityConstraintSelection<ConstraintValue> | null {
	let currentConstraint: ConstraintValue | null = null;
	let currentStartAt = Number.NEGATIVE_INFINITY;
	let nextConstraint: ConstraintValue | null = null;
	let nextStartAt = Number.POSITIVE_INFINITY;

	for (const constraint of constraints) {
		const { endAt, startAt } = availabilityConstraintBounds(constraint.timing);
		if (startAt <= currentTimestamp && currentTimestamp <= endAt) {
			if (startAt > currentStartAt) {
				currentConstraint = constraint;
				currentStartAt = startAt;
			}
			continue;
		}
		if (startAt > currentTimestamp && startAt < nextStartAt) {
			nextConstraint = constraint;
			nextStartAt = startAt;
		}
	}

	if (currentConstraint) {
		return { constraint: currentConstraint, kind: 'current' };
	}
	return nextConstraint ? { constraint: nextConstraint, kind: 'next' } : null;
}

/** Returns the chronologically latest constraint, retaining useful availability context after it has ended. */
export function latestAvailabilityConstraint<ConstraintValue extends Pick<Constraint, 'timing'>>(
	constraints: readonly ConstraintValue[]
): ConstraintValue | null {
	let latestConstraint: ConstraintValue | null = null;
	let latestStartAt = Number.NEGATIVE_INFINITY;

	for (const constraint of constraints) {
		const { startAt } = availabilityConstraintBounds(constraint.timing);
		if (startAt > latestStartAt) {
			latestConstraint = constraint;
			latestStartAt = startAt;
		}
	}

	return latestConstraint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Adds the persisted availability default to pre-availability item records without changing supplied values. */
export function migrateLegacyItemAvailability<SourceItinerary extends ItineraryRecord>(
	itinerary: SourceItinerary
): SourceItinerary {
	if (!Array.isArray(itinerary.items)) {
		return itinerary;
	}

	return {
		...itinerary,
		items: itinerary.items.map((item) =>
			isRecord(item) && !Object.hasOwn(item, 'availability') ? { ...item, availability: [] } : item
		)
	};
}
