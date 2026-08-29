import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tripDeleteRequestSchema, tripDetailsSaveRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { deleteTrip } from '$lib/server/store/trips';
import { saveTripDetails } from '$lib/server/store/itinerary-mutations';

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = tripDetailsSaveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The trip details are invalid.' }, { status: 400 });
	}

	try {
		return json(
			await saveTripDetails({
				...payload.data,
				tripId: params.tripId,
				userId: user.id
			})
		);
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = tripDeleteRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'A valid trip revision is required to delete this trip.' }, { status: 400 });
	}

	try {
		await deleteTrip({ ...payload.data, tripId: params.tripId, userId: user.id });
		return new Response(null, { status: 204 });
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
