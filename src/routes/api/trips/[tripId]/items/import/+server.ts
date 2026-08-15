import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { itineraryItemImportRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { GoogleItineraryImportError, resolveGoogleItineraryUrl } from '$lib/server/google-itinerary';
import { assertTripOwnerAccess } from '$lib/server/store/trips';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = itineraryItemImportRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'Provide a valid Google Maps, Google Flights, or Google Hotels link.' }, { status: 400 });
	}

	try {
		await assertTripOwnerAccess({ tripId: params.tripId, userId: user.id });
		return json({ items: await resolveGoogleItineraryUrl(payload.data.url) });
	} catch (error: unknown) {
		if (error instanceof GoogleItineraryImportError) {
			return json({ message: error.message }, { status: error.status });
		}
		return storeErrorResponse(error);
	}
};
