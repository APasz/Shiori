import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { editLockTokenRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { acquireTripStructureLock, releaseTripStructureLock, renewTripStructureLock } from '$lib/server/store';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	try {
		return json(await acquireTripStructureLock({ tripId: params.tripId, userId: locals.user.id }), {
			status: 201
		});
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = editLockTokenRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'A valid edit lock token is required.' }, { status: 400 });
	}

	try {
		return json(
			await renewTripStructureLock({
				lockToken: payload.data.lockToken,
				tripId: params.tripId,
				userId: locals.user.id
			})
		);
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = editLockTokenRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'A valid edit lock token is required.' }, { status: 400 });
	}

	try {
		await releaseTripStructureLock({
			lockToken: payload.data.lockToken,
			tripId: params.tripId,
			userId: locals.user.id
		});
		return new Response(null, { status: 204 });
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
