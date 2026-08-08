import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { googleMapsLocationResolveRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { GoogleMapsResolveError, resolveGoogleMapsLocation } from '$lib/server/google-maps';
import { assertTripOwnerAccess } from '$lib/server/store';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = googleMapsLocationResolveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'Provide a valid Google Maps link.' }, { status: 400 });
	}

	try {
		await assertTripOwnerAccess({ tripId: params.tripId, userId: user.id });
		return json(await resolveGoogleMapsLocation(payload.data.url));
	} catch (error: unknown) {
		if (error instanceof GoogleMapsResolveError) {
			return json({ message: error.message }, { status: error.status });
		}
		return storeErrorResponse(error);
	}
};
