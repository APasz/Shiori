import { amountInputValue, amountMinorFromInput } from '$lib/money';
import { defaultDayNoteAnchorAt, defaultNoteAnchorTime } from './note-anchor';
import type { CurrencyCode, ItineraryNote, ItineraryNoteEditorTarget, NoteEntryState } from './schema';
import { isOnOrAfterUnixEpoch } from './unix-time';
import { formatTimestampForTimeZoneInput, zonedDateTimeToUnixMilliseconds } from './zoned-time';

export type NoteEstimatedCostDraft = {
	amount: string;
	currency: CurrencyCode;
	id: string;
	label: string;
};

export type NoteLinkDraft = {
	id: string;
	name: string;
	url: string;
};

export type NoteEntryDraft = {
	estimatedCosts: NoteEstimatedCostDraft[];
	id: string;
	links: NoteLinkDraft[];
	note: string;
	state: NoteEntryState;
	endTime: string;
	startTime: string;
	title: string;
};

type ItineraryNoteDraftBase = {
	entries: NoteEntryDraft[];
	text: string;
	timeZone: string;
};
type DayItineraryNoteDraft = ItineraryNoteDraftBase & {
	anchorAt: number | null;
	anchorDate: string;
	anchorTime: string;
	id: string;
	kind: 'day';
};

export type ItineraryNoteDraft = (ItineraryNoteDraftBase & { kind: 'trip' }) | DayItineraryNoteDraft;

type InvalidNoteDraft = { readonly error: string; readonly valid: false };

export type NoteDraftValidation = { readonly note: ItineraryNote; readonly valid: true } | InvalidNoteDraft;

/** Creates the mutable fields used by the note editor from a persisted itinerary note. */
export function itineraryNoteDraft(
	initialNote: ItineraryNote | undefined,
	defaultTimeZone: string,
	target: ItineraryNoteEditorTarget,
	createDayNoteId: () => string = () => crypto.randomUUID()
): ItineraryNoteDraft {
	if (initialNote !== undefined && initialNote.kind !== target.kind) {
		throw new Error('The note does not match its editor target.');
	}

	const base = {
		entries: initialNote?.entries.map(noteEntryDraft) ?? [],
		text: initialNote?.text ?? '',
		timeZone: initialNote?.timeZone ?? defaultTimeZone
	};
	if (target.kind === 'trip') {
		return { ...base, kind: 'trip' };
	}

	if (initialNote?.kind === 'day') {
		const anchorDateTime = anchorDateTimeFor(initialNote.anchorAt, initialNote.timeZone);
		return {
			...base,
			anchorAt: initialNote.anchorAt,
			anchorDate: anchorDateTime.slice(0, 10),
			anchorTime: anchorDateTime.slice(11),
			id: initialNote.id,
			kind: 'day'
		};
	}

	const anchorAt = defaultDayNoteAnchorAt(target.date, target.viewerTimeZone);
	const anchorDateTime = anchorAt === null ? null : formatTimestampForTimeZoneInput(anchorAt, defaultTimeZone);
	return {
		...base,
		anchorAt,
		anchorDate: anchorDateTime?.slice(0, 10) ?? target.date,
		anchorTime: anchorDateTime?.slice(11) ?? defaultNoteAnchorTime,
		id: createDayNoteId(),
		kind: 'day'
	};
}

/** Changes the entry-time zone while preserving a valid daily note's absolute anchor. */
export function itineraryNoteDraftForTimeZone(draft: ItineraryNoteDraft, timeZone: string): ItineraryNoteDraft {
	if (draft.kind === 'trip') {
		return { ...draft, timeZone };
	}

	const anchorAt = anchorAtForDraft(draft);
	if (anchorAt === null) {
		return { ...draft, timeZone };
	}
	const anchorDateTime = formatTimestampForTimeZoneInput(anchorAt, timeZone);
	return anchorDateTime === null
		? { ...draft, timeZone }
		: {
				...draft,
				anchorAt,
				anchorDate: anchorDateTime.slice(0, 10),
				anchorTime: anchorDateTime.slice(11),
				timeZone
			};
}

/** Produces a stable snapshot for deciding whether closing the editor would discard changes. */
export function itineraryNoteDraftFingerprint(draft: ItineraryNoteDraft): string {
	return JSON.stringify(draft);
}

export function emptyNoteEntryDraft(id: string): NoteEntryDraft {
	return {
		estimatedCosts: [],
		id,
		links: [],
		note: '',
		state: 'idea',
		endTime: '',
		startTime: '',
		title: ''
	};
}

export function emptyNoteEstimatedCostDraft(id: string, currency: CurrencyCode): NoteEstimatedCostDraft {
	return { amount: '', currency, id, label: '' };
}

export function emptyNoteLinkDraft(id: string): NoteLinkDraft {
	return { id, name: '', url: '' };
}

/** Normalizes optional draft values and checks the field combinations the schema cannot describe. */
export function validateItineraryNoteDraft(draft: ItineraryNoteDraft): NoteDraftValidation {
	const entries: ItineraryNote['entries'] = [];
	for (const entry of draft.entries) {
		const estimatedCosts = estimatedCostsForDraft(entry);
		if (!estimatedCosts.valid) {
			return estimatedCosts;
		}

		const links = linksForDraft(entry);
		if (!links.valid) {
			return links;
		}

		const note = optionalText(entry.note);
		entries.push({
			estimatedCosts: estimatedCosts.estimatedCosts,
			id: entry.id,
			links: links.links,
			...(note === undefined ? {} : { note }),
			state: entry.state,
			...(entry.endTime === '' ? {} : { endTime: entry.endTime }),
			...(entry.startTime === '' ? {} : { startTime: entry.startTime }),
			title: entry.title.trim()
		});
	}

	if (draft.kind === 'trip') {
		return { note: { entries, kind: 'trip', text: draft.text, timeZone: draft.timeZone }, valid: true };
	}

	const anchorAt = anchorAtForDraft(draft);
	if (anchorAt === null) {
		return { error: 'Choose a valid anchor time for the selected time zone.', valid: false };
	}
	if (!isOnOrAfterUnixEpoch(anchorAt)) {
		return { error: 'Choose an anchor time on or after the Unix epoch.', valid: false };
	}
	return {
		note: { anchorAt, entries, id: draft.id, kind: 'day', text: draft.text, timeZone: draft.timeZone },
		valid: true
	};
}

function anchorDateTimeFor(anchorAt: number, timeZone: string): string {
	const anchorDateTime = formatTimestampForTimeZoneInput(anchorAt, timeZone);
	if (anchorDateTime === null) {
		throw new Error(`Cannot localize note anchor ${anchorAt} in ${timeZone}.`);
	}
	return anchorDateTime;
}

function anchorAtForDraft(draft: DayItineraryNoteDraft): number | null {
	const localAnchor = `${draft.anchorDate}T${draft.anchorTime}`;
	if (draft.anchorAt !== null && formatTimestampForTimeZoneInput(draft.anchorAt, draft.timeZone) === localAnchor) {
		return draft.anchorAt;
	}
	return zonedDateTimeToUnixMilliseconds(localAnchor, draft.timeZone);
}

function noteEntryDraft(entry: ItineraryNote['entries'][number]): NoteEntryDraft {
	return {
		estimatedCosts: entry.estimatedCosts.map((estimatedCost) => ({
			amount: amountInputValue(estimatedCost.amountMinor, estimatedCost.currency),
			currency: estimatedCost.currency,
			id: estimatedCost.id,
			label: estimatedCost.label ?? ''
		})),
		id: entry.id,
		links: entry.links.map((link, index) => ({
			id: `${entry.id}-link-${index}`,
			name: link.label,
			url: link.url
		})),
		note: entry.note ?? '',
		state: entry.state,
		endTime: entry.endTime ?? '',
		startTime: entry.startTime ?? '',
		title: entry.title
	};
}

function optionalText(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

function estimatedCostsForDraft(
	entry: NoteEntryDraft
):
	| { readonly estimatedCosts: ItineraryNote['entries'][number]['estimatedCosts']; readonly valid: true }
	| InvalidNoteDraft {
	const estimatedCosts: ItineraryNote['entries'][number]['estimatedCosts'] = [];
	for (const estimatedCost of entry.estimatedCosts) {
		const label = optionalText(estimatedCost.label);
		if (estimatedCost.amount.trim() === '' && label === undefined) {
			continue;
		}

		const amountMinor = amountMinorFromInput(estimatedCost.amount, estimatedCost.currency);
		if (amountMinor === null || amountMinor === 0) {
			return {
				error: `Enter a positive ${estimatedCost.currency} estimate with the supported number of decimal places.`,
				valid: false
			};
		}
		estimatedCosts.push({
			amountMinor,
			currency: estimatedCost.currency,
			id: estimatedCost.id,
			...(label === undefined ? {} : { label })
		});
	}
	return { estimatedCosts, valid: true };
}

function linksForDraft(
	entry: NoteEntryDraft
): { readonly links: ItineraryNote['entries'][number]['links']; readonly valid: true } | InvalidNoteDraft {
	const links: ItineraryNote['entries'][number]['links'] = [];
	for (const link of entry.links) {
		const name = optionalText(link.name);
		const url = optionalText(link.url);
		if (name === undefined && url === undefined) {
			continue;
		}
		if (name === undefined || url === undefined) {
			return { error: 'Each link needs both a name and URL.', valid: false };
		}
		links.push({ label: name, url });
	}
	return { links, valid: true };
}
