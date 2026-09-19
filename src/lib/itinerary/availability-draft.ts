import {
	constraintSchema,
	constraintTypeSchema,
	type Constraint,
	type ConstraintTimingKind,
	type ConstraintType,
	type ItineraryItemType
} from './schema';
import { formatTimestampForTimeZoneInput, isValidIanaTimeZone, zonedDateTimeToUnixMilliseconds } from './zoned-time';

export type AvailabilityConstraintDraft = {
	at: string;
	endAt: string;
	id: string;
	isExpanded: boolean;
	label: string;
	originalAt?: number;
	originalEndAt?: number;
	originalStartAt?: number;
	startAt: string;
	timingKind: ConstraintTimingKind;
	timeZone: string;
	type: ConstraintType;
};

export const availabilityTypeLabels = {
	'opening-hours': 'Opening hours',
	'reception-hours': 'Reception hours',
	'desk-hours': 'Desk hours',
	'storage-hours': 'Storage hours',
	'last-admission': 'Last admission',
	cutoff: 'Cutoff',
	other: 'Other'
} as const satisfies Record<ConstraintType, string>;

export const availabilityTimingKindLabels = {
	period: 'Period',
	deadline: 'Deadline'
} as const satisfies Record<ConstraintTimingKind, string>;

export const availabilityTypeSuggestions = {
	activity: ['opening-hours', 'last-admission', 'desk-hours', 'other'],
	accommodation: ['reception-hours', 'storage-hours', 'desk-hours', 'other'],
	transport: ['desk-hours', 'cutoff', 'storage-hours', 'other']
} as const satisfies Record<ItineraryItemType, readonly ConstraintType[]>;

function incompleteDateTime(defaultDate: string | undefined): string {
	return defaultDate === undefined ? '' : `${defaultDate}T`;
}

function optionalText(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

/** Preserves an existing instant when its local representation has not changed. */
function timestampValue(value: string, timeZone: string, originalTimestamp?: number): number {
	if (originalTimestamp !== undefined && formatTimestampForTimeZoneInput(originalTimestamp, timeZone) === value) {
		return originalTimestamp;
	}
	return zonedDateTimeToUnixMilliseconds(value, timeZone) ?? Number.NaN;
}

function reformatInTimeZone(
	value: string,
	sourceTimeZone: string,
	targetTimeZone: string,
	originalTimestamp?: number
): string {
	const timestamp = timestampValue(value, sourceTimeZone, originalTimestamp);
	return isValidIanaTimeZone(targetTimeZone)
		? (formatTimestampForTimeZoneInput(timestamp, targetTimeZone) ?? value)
		: value;
}

/** Returns item-specific suggestions first while retaining every generic persisted type as an option. */
export function availabilityTypesForItem(itemType: ItineraryItemType): ConstraintType[] {
	const suggested = availabilityTypeSuggestions[itemType] as readonly ConstraintType[];
	return [...suggested, ...constraintTypeSchema.options.filter((type) => !suggested.includes(type))];
}

export function defaultAvailabilityType(itemType: ItineraryItemType): ConstraintType {
	return availabilityTypeSuggestions[itemType][0];
}

/** Creates a blank expanded entry without inventing a time of day. */
export function createAvailabilityConstraintDraft(input: {
	defaultDate?: string;
	id: string;
	itemType: ItineraryItemType;
	timeZone: string;
}): AvailabilityConstraintDraft {
	const dateTime = incompleteDateTime(input.defaultDate);
	return {
		at: dateTime,
		endAt: dateTime,
		id: input.id,
		isExpanded: true,
		label: '',
		startAt: dateTime,
		timingKind: 'period',
		timeZone: input.timeZone,
		type: defaultAvailabilityType(input.itemType)
	};
}

/** Converts a persisted availability entry into date/time editor state in its own time zone. */
export function availabilityConstraintDraftFromConstraint(constraint: Constraint): AvailabilityConstraintDraft {
	const common = {
		id: constraint.id,
		isExpanded: false,
		label: constraint.label ?? '',
		timeZone: constraint.timing.timeZone,
		type: constraint.type
	};

	if (constraint.timing.kind === 'period') {
		return {
			...common,
			at: '',
			endAt: formatTimestampForTimeZoneInput(constraint.timing.endAt, constraint.timing.timeZone) ?? '',
			originalEndAt: constraint.timing.endAt,
			originalStartAt: constraint.timing.startAt,
			startAt: formatTimestampForTimeZoneInput(constraint.timing.startAt, constraint.timing.timeZone) ?? '',
			timingKind: 'period'
		};
	}

	return {
		...common,
		at: formatTimestampForTimeZoneInput(constraint.timing.at, constraint.timing.timeZone) ?? '',
		endAt: '',
		originalAt: constraint.timing.at,
		startAt: '',
		timingKind: 'deadline'
	};
}

/** Changes an availability entry's zone while retaining its represented instants. */
export function availabilityConstraintDraftForTimeZone(
	draft: AvailabilityConstraintDraft,
	timeZone: string
): AvailabilityConstraintDraft {
	if (draft.timeZone === timeZone || !isValidIanaTimeZone(timeZone)) {
		return draft;
	}

	return {
		...draft,
		at: reformatInTimeZone(draft.at, draft.timeZone, timeZone, draft.originalAt),
		endAt: reformatInTimeZone(draft.endAt, draft.timeZone, timeZone, draft.originalEndAt),
		startAt: reformatInTimeZone(draft.startAt, draft.timeZone, timeZone, draft.originalStartAt),
		timeZone
	};
}

/** Builds the persisted candidate, leaving schema validation to report incomplete or invalid editor input. */
export function availabilityConstraintCandidate(draft: AvailabilityConstraintDraft): unknown {
	const label = optionalText(draft.label);
	const timing =
		draft.timingKind === 'period'
			? {
					endAt: timestampValue(draft.endAt, draft.timeZone, draft.originalEndAt),
					kind: 'period' as const,
					startAt: timestampValue(draft.startAt, draft.timeZone, draft.originalStartAt),
					timeZone: draft.timeZone
				}
			: {
					at: timestampValue(draft.at, draft.timeZone, draft.originalAt),
					kind: 'deadline' as const,
					timeZone: draft.timeZone
				};
	return {
		id: draft.id.trim(),
		type: draft.type,
		...(label === undefined ? {} : { label }),
		timing
	};
}

export function validateAvailabilityConstraintDraft(draft: AvailabilityConstraintDraft) {
	return constraintSchema.safeParse(availabilityConstraintCandidate(draft));
}
