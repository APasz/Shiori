import { apiErrorSchema, editSaveResponseSchema, noteDeleteRequestSchema, noteSaveRequestSchema } from './contracts';
import type { ItineraryNote, ItineraryNoteTarget } from '$lib/itinerary/schema';

export type ItineraryNoteMutationResult =
	{ readonly success: true } | { readonly error: string; readonly success: false };

type ItineraryNoteMutationInput = {
	endpoint: string;
	revision: number;
};

export async function saveItineraryNote(
	input: ItineraryNoteMutationInput & { note: ItineraryNote }
): Promise<ItineraryNoteMutationResult> {
	const payload = noteSaveRequestSchema.safeParse({ note: input.note, revision: input.revision });
	if (!payload.success) {
		return { error: 'Check the note, entry titles, times, and estimates.', success: false };
	}

	return mutateItineraryNote(
		input.endpoint,
		'PUT',
		payload.data,
		'The note could not be saved.',
		'The note could not be saved because the server is unavailable.'
	);
}

export async function deleteItineraryNote(
	input: ItineraryNoteMutationInput & { target: ItineraryNoteTarget }
): Promise<ItineraryNoteMutationResult> {
	const payload = noteDeleteRequestSchema.safeParse({ revision: input.revision, target: input.target });
	if (!payload.success) {
		return { error: 'The note could not be deleted.', success: false };
	}

	return mutateItineraryNote(
		input.endpoint,
		'DELETE',
		payload.data,
		'The note could not be deleted.',
		'The note could not be deleted because the server is unavailable.'
	);
}

async function mutateItineraryNote(
	endpoint: string,
	method: 'DELETE' | 'PUT',
	payload: unknown,
	fallbackError: string,
	unavailableError: string
): Promise<ItineraryNoteMutationResult> {
	try {
		const response = await fetch(endpoint, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await responseData(response);
		if (!response.ok || !editSaveResponseSchema.safeParse(data).success) {
			return { error: errorFrom(data, fallbackError), success: false };
		}
		return { success: true };
	} catch {
		return { error: unavailableError, success: false };
	}
}

function errorFrom(data: unknown, fallback: string): string {
	const parsed = apiErrorSchema.safeParse(data);
	return parsed.success ? parsed.data.message : fallback;
}

async function responseData(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
