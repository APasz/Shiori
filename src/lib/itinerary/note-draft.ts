import { amountInputValue, amountMinorFromInput } from '$lib/money';
import type { CurrencyCode, ItineraryNote, ItineraryNoteTarget, NoteEntryState } from './schema';

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

export type ItineraryNoteDraft = {
	entries: NoteEntryDraft[];
	text: string;
	timeZone: string;
};

type InvalidNoteDraft = { readonly error: string; readonly valid: false };

export type NoteDraftValidation = { readonly note: ItineraryNote; readonly valid: true } | InvalidNoteDraft;

/** Creates the mutable fields used by the note editor from a persisted itinerary note. */
export function itineraryNoteDraft(
	initialNote: ItineraryNote | undefined,
	defaultTimeZone: string
): ItineraryNoteDraft {
	if (initialNote === undefined) {
		return { entries: [], text: '', timeZone: defaultTimeZone };
	}

	return {
		entries: initialNote.entries.map(noteEntryDraft),
		text: initialNote.text,
		timeZone: initialNote.timeZone
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
export function validateItineraryNoteDraft(
	draft: ItineraryNoteDraft,
	target: ItineraryNoteTarget
): NoteDraftValidation {
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

	return {
		note:
			target.kind === 'trip'
				? { entries, kind: 'trip', text: draft.text, timeZone: draft.timeZone }
				: { date: target.date, entries, kind: 'day', text: draft.text, timeZone: draft.timeZone },
		valid: true
	};
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
