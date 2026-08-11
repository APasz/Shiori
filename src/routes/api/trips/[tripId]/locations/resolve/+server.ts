import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { locationResolveRequestSchema } from '$lib/editing/contracts';
import { isGoogleMapsUrl } from '$lib/itinerary/schema';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { GoogleMapsResolveError, resolveGoogleMapsLocation } from '$lib/server/google-maps';
import { OpenRailwayMapResolveError, parseOpenRailwayMapLocationUrl } from '$lib/server/openrailwaymap';
import { assertTripOwnerAccess } from '$lib/server/store';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = locationResolveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'Provide a valid Google Maps or OpenRailwayMap link.' }, { status: 400 });
	}

	try {
		await assertTripOwnerAccess({ tripId: params.tripId, userId: user.id });
		return json(
			isGoogleMapsUrl(payload.data.url)
				? await resolveGoogleMapsLocation(payload.data.url)
				: parseOpenRailwayMapLocationUrl(new URL(payload.data.url))
		);
	} catch (error: unknown) {
		if (error instanceof GoogleMapsResolveError || error instanceof OpenRailwayMapResolveError) {
			return json({ message: error.message }, { status: error.status });
		}
		return storeErrorResponse(error);
	}
};
