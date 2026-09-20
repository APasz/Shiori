import {
	constraintSchema,
	constraintTypeSchema,
	type Constraint,
	type ConstraintTimingKind,
	type ConstraintType,
	type ItineraryItemType
} from './schema';
import { availabilityTypeSuggestions, preferredAvailabilityTimingKind } from './availability';
import {
	formatTimestampForTimeZoneInput,
	isCompleteLocalDateTime,
	isValidIanaTimeZone,
	zonedDateTimeToUnixMilliseconds
} from './zoned-time';

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

function incompleteDateTime(defaultDate: string | undefined): string {
	return defaultDate === undefined ? '' : `${defaultDate}T`;
}

function datePortion(value: string): string | undefined {
	const date = value.slice(0, 10);
	return isCompleteLocalDateTime(`${date}T00:00`) ? date : undefined;
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

function incompleteDateTimeForTimingSwitch(draft: AvailabilityConstraintDraft): string {
	const values =
		draft.timingKind === 'period' ? [draft.startAt, draft.endAt, draft.at] : [draft.at, draft.startAt, draft.endAt];
	for (const value of values) {
		const date = datePortion(value);
		if (date !== undefined) {
			return incompleteDateTime(date);
		}
	}
	return '';
}

function dateTimeWithFallbackDate(value: string, fallback: string): string {
	return datePortion(value) === undefined ? fallback : value;
}

/** Switches timing modes while retaining entered target-mode values and a usable source date. */
export function availabilityConstraintDraftForTimingKind(
	draft: AvailabilityConstraintDraft,
	timingKind: ConstraintTimingKind
): AvailabilityConstraintDraft {
	if (draft.timingKind === timingKind) {
		return draft;
	}

	const dateTime = incompleteDateTimeForTimingSwitch(draft);
	return timingKind === 'period'
		? {
				...draft,
				endAt: dateTimeWithFallbackDate(draft.endAt, dateTime),
				startAt: dateTimeWithFallbackDate(draft.startAt, dateTime),
				timingKind
			}
		: { ...draft, at: dateTimeWithFallbackDate(draft.at, dateTime), timingKind };
}

/** Returns item-specific suggestions first while retaining every generic persisted type as an option. */
export function availabilityTypesForItem(itemType: ItineraryItemType): ConstraintType[] {
	const suggested = availabilityTypeSuggestions[itemType] as readonly ConstraintType[];
	return [...suggested, ...constraintTypeSchema.options.filter((type) => !suggested.includes(type))];
}

export function defaultAvailabilityType(itemType: ItineraryItemType): ConstraintType {
	return availabilityTypeSuggestions[itemType][0];
}

/** Returns whether the draft's selected timing mode is still missing a complete local date and time. */
export function isAvailabilityConstraintDraftIncomplete(draft: AvailabilityConstraintDraft): boolean {
	return draft.timingKind === 'period'
		? !isCompleteLocalDateTime(draft.startAt) || !isCompleteLocalDateTime(draft.endAt)
		: !isCompleteLocalDateTime(draft.at);
}

/**
 * Updates an availability type and applies its editor timing suggestion only while the draft timing is incomplete.
 * Persisted type and timing remain independent: a complete timing is never converted by a type change.
 */
export function availabilityConstraintDraftForType(
	draft: AvailabilityConstraintDraft,
	type: ConstraintType
): AvailabilityConstraintDraft {
	if (draft.type === type) {
		return draft;
	}

	const typeDraft = { ...draft, type };
	const preferredTimingKind = preferredAvailabilityTimingKind(type);
	if (
		preferredTimingKind === undefined ||
		preferredTimingKind === draft.timingKind ||
		!isAvailabilityConstraintDraftIncomplete(draft)
	) {
		return typeDraft;
	}

	return availabilityConstraintDraftForTimingKind(typeDraft, preferredTimingKind);
}

/** Creates a blank expanded entry without inventing a time of day. */
export function createAvailabilityConstraintDraft(input: {
	defaultDate?: string;
	id: string;
	itemType: ItineraryItemType;
	timeZone: string;
}): AvailabilityConstraintDraft {
	const dateTime = incompleteDateTime(input.defaultDate);
	const type = defaultAvailabilityType(input.itemType);
	return {
		at: dateTime,
		endAt: dateTime,
		id: input.id,
		isExpanded: true,
		label: '',
		startAt: dateTime,
		timingKind: preferredAvailabilityTimingKind(type) ?? 'period',
		timeZone: input.timeZone,
		type
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
		timingKind: constraint.timing.kind
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
					kind: draft.timingKind,
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
