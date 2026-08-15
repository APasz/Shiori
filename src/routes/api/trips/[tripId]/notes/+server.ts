import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { noteDeleteRequestSchema, noteSaveRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { deleteNote, saveNote } from '$lib/server/store/itinerary-mutations';

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = noteSaveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The note is invalid.' }, { status: 400 });
	}

	try {
		return json(await saveNote({ ...payload.data, tripId: params.tripId, userId: locals.user.id }));
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = noteDeleteRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The note deletion is invalid.' }, { status: 400 });
	}

	try {
		return json(await deleteNote({ ...payload.data, tripId: params.tripId, userId: locals.user.id }));
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
