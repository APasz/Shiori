import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tripCreateRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse } from '$lib/server/api';
import { createTrip } from '$lib/server/store';

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) {
		return json({ message: 'Sign in to create a trip.' }, { status: 401 });
	}

	const payload = tripCreateRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The new trip details are invalid.' }, { status: 400 });
	}

	try {
		return json(await createTrip({ details: payload.data.details, ownerId: user.id }), {
			status: 201
		});
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
