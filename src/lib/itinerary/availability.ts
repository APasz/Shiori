import type {
	AvailabilityConstraint,
	AvailabilityConstraintType,
	AvailabilityTiming,
	AvailabilityTimingKind,
	ItineraryItemType
} from './schema';

type ItineraryRecord = Record<string, unknown>;
type OpeningHoursPeriodConstraint = AvailabilityConstraint &
	Readonly<{
		timing: Extract<AvailabilityTiming, { kind: 'period' }>;
		type: 'opening-hours';
	}>;

const availabilityTypeDetails = {
	'opening-hours': { editorLabel: 'Opening hours', preferredTimingKind: 'period', presentationLabel: 'Opening' },
	'reception-hours': { editorLabel: 'Reception hours', preferredTimingKind: 'period', presentationLabel: 'Reception' },
	'check-in': { editorLabel: 'Check-in time', preferredTimingKind: 'from', presentationLabel: 'Check-in' },
	'check-out': { editorLabel: 'Check-out time', preferredTimingKind: 'until', presentationLabel: 'Check-out' },
	'desk-hours': { editorLabel: 'Desk hours', preferredTimingKind: 'period', presentationLabel: 'Desk' },
	'storage-hours': { editorLabel: 'Storage hours', preferredTimingKind: 'period', presentationLabel: 'Storage' },
	'last-admission': {
		editorLabel: 'Last admission',
		preferredTimingKind: 'until',
		presentationLabel: 'Last admission'
	},
	cutoff: { editorLabel: 'Cutoff', preferredTimingKind: 'until', presentationLabel: 'Cutoff' },
	other: { editorLabel: 'Other', preferredTimingKind: undefined, presentationLabel: 'Other' }
} as const satisfies Record<
	AvailabilityConstraintType,
	Readonly<{
		editorLabel: string;
		preferredTimingKind: AvailabilityTimingKind | undefined;
		presentationLabel: string;
	}>
>;

export const availabilityTimingKindLabels = {
	period: 'Period',
	from: 'From',
	until: 'Until'
} as const satisfies Record<AvailabilityTimingKind, string>;

export const availabilityTypeSuggestions = {
	activity: ['opening-hours', 'last-admission', 'desk-hours', 'other'],
	accommodation: ['reception-hours', 'check-in', 'check-out', 'storage-hours', 'desk-hours', 'other'],
	transport: ['desk-hours', 'cutoff', 'storage-hours', 'other']
} as const satisfies Record<ItineraryItemType, readonly AvailabilityConstraintType[]>;

export function availabilityTypeEditorLabel(type: AvailabilityConstraintType): string {
	return availabilityTypeDetails[type].editorLabel;
}

export function availabilityTypePresentationLabel(type: AvailabilityConstraintType): string {
	return availabilityTypeDetails[type].presentationLabel;
}

/** Returns the editor's suggested timing mode, without imposing a persisted type-to-timing relationship. */
export function preferredAvailabilityTimingKind(type: AvailabilityConstraintType): AvailabilityTimingKind | undefined {
	return availabilityTypeDetails[type].preferredTimingKind;
}

export type AvailabilityConstraintBounds = Readonly<{
	endAt: number;
	startAt: number;
}>;

export type AvailabilityConstraintSelection<
	AvailabilityConstraintValue extends Pick<AvailabilityConstraint, 'timing'> = AvailabilityConstraint
> = Readonly<{
	constraint: AvailabilityConstraintValue;
	kind: 'current' | 'next';
}>;

/** Returns inclusive availability bounds, with an unbounded side represented by infinity. */
export function availabilityConstraintBounds(timing: AvailabilityTiming): AvailabilityConstraintBounds {
	switch (timing.kind) {
		case 'period':
			return { endAt: timing.endAt, startAt: timing.startAt };
		case 'from':
			return { endAt: Number.POSITIVE_INFINITY, startAt: timing.at };
		case 'until':
			return { endAt: timing.at, startAt: Number.NEGATIVE_INFINITY };
	}
}

/** Returns whether an availability constraint makes the intended item itself usable for a period. */
export function isOpeningHoursPeriodConstraint(
	constraint: AvailabilityConstraint
): constraint is OpeningHoursPeriodConstraint {
	return constraint.type === 'opening-hours' && constraint.timing.kind === 'period';
}

/** Selects the active availability constraint, or the nearest future one, without treating it as itinerary timing. */
export function currentOrNextAvailabilityConstraint<
	AvailabilityConstraintValue extends Pick<AvailabilityConstraint, 'timing'>
>(
	constraints: readonly AvailabilityConstraintValue[],
	currentTimestamp: number
): AvailabilityConstraintSelection<AvailabilityConstraintValue> | null {
	let currentConstraint: AvailabilityConstraintValue | null = null;
	let currentStartAt = Number.NEGATIVE_INFINITY;
	let nextConstraint: AvailabilityConstraintValue | null = null;
	let nextStartAt = Number.POSITIVE_INFINITY;

	for (const constraint of constraints) {
		const { endAt, startAt } = availabilityConstraintBounds(constraint.timing);
		if (startAt <= currentTimestamp && currentTimestamp <= endAt) {
			if (currentConstraint === null || startAt > currentStartAt) {
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

/** Returns the chronologically latest availability constraint, retaining useful context after it has ended. */
export function latestAvailabilityConstraint<
	AvailabilityConstraintValue extends Pick<AvailabilityConstraint, 'timing'>
>(constraints: readonly AvailabilityConstraintValue[]): AvailabilityConstraintValue | null {
	let latestConstraint: AvailabilityConstraintValue | null = null;
	let latestStartAt = Number.NEGATIVE_INFINITY;

	for (const constraint of constraints) {
		const { startAt } = availabilityConstraintBounds(constraint.timing);
		if (latestConstraint === null || startAt > latestStartAt) {
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

/** Replaces the ambiguous legacy deadline shape while preserving every other persisted field. */
export function migrateLegacyConstraintTiming<SourceItinerary extends ItineraryRecord>(
	itinerary: SourceItinerary
): SourceItinerary {
	if (!Array.isArray(itinerary.items)) {
		return itinerary;
	}

	return {
		...itinerary,
		items: itinerary.items.map((item) => {
			if (!isRecord(item) || !Array.isArray(item.availability)) {
				return item;
			}
			return {
				...item,
				availability: item.availability.map((constraint) => {
					if (!isRecord(constraint) || !isRecord(constraint.timing) || constraint.timing.kind !== 'deadline') {
						return constraint;
					}
					return {
						...constraint,
						timing: {
							...constraint.timing,
							kind: constraint.type === 'check-in' ? 'from' : 'until'
						}
					};
				})
			};
		})
	};
}
