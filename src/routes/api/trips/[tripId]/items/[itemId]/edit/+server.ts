import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { editLockTokenRequestSchema, editSaveRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { acquireItemLock, releaseItemLock, renewItemLock } from '$lib/server/store/edit-locks';
import { saveItem } from '$lib/server/store/items';

export const POST: RequestHandler = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	try {
		const lock = await acquireItemLock({
			tripId: params.tripId,
			itemId: params.itemId,
			userId: user.id
		});
		return json(lock, { status: 201 });
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = editLockTokenRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'A valid edit lock token is required.' }, { status: 400 });
	}

	try {
		const lock = await renewItemLock({
			tripId: params.tripId,
			itemId: params.itemId,
			userId: user.id,
			lockToken: payload.data.lockToken
		});
		return json(lock);
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = editSaveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The edited item is invalid.' }, { status: 400 });
	}

	try {
		const result = await saveItem({
			tripId: params.tripId,
			itemId: params.itemId,
			userId: user.id,
			...payload.data
		});
		return json(result);
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = editLockTokenRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'A valid edit lock token is required.' }, { status: 400 });
	}

	try {
		await releaseItemLock({
			tripId: params.tripId,
			itemId: params.itemId,
			userId: user.id,
			lockToken: payload.data.lockToken
		});
		return new Response(null, { status: 204 });
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
