import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { locationResolveRequestSchema } from '$lib/editing/contracts';
import { isGoogleHotelPropertyUrl, isGoogleMapsUrl } from '$lib/itinerary/schema';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { GoogleHotelPropertyResolveError, resolveGoogleHotelPropertyUrl } from '$lib/server/google-hotels';
import { GoogleMapsResolveError, googleMapsSearchUrl, resolveGoogleMapsLocation } from '$lib/server/google-maps';
import { lookupGoogleMapsPlace } from '$lib/server/google-places';
import { OpenRailwayMapResolveError, parseOpenRailwayMapLocationUrl } from '$lib/server/openrailwaymap';
import { assertTripOwnerAccess } from '$lib/server/store/trips';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = locals.user;
	if (!user) {
		return unauthenticatedEditResponse();
	}

	const payload = locationResolveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json(
			{ message: 'Provide a valid Google Maps, Google Hotels property, or OpenRailwayMap link.' },
			{ status: 400 }
		);
	}

	try {
		await assertTripOwnerAccess({ tripId: params.tripId, userId: user.id });
		if (isGoogleMapsUrl(payload.data.url)) {
			const location = await resolveGoogleMapsLocation(payload.data.url);
			return json({
				...(location.address ? { address: location.address } : {}),
				...(location.coordinates ? { coordinates: location.coordinates } : {}),
				googleMapsUrl: location.googleMapsUrl,
				...(location.name ? { name: location.name } : {}),
				...(location.timeZone ? { timeZone: location.timeZone } : {})
			});
		}
		if (isGoogleHotelPropertyUrl(payload.data.url)) {
			const resolved = await resolveGoogleHotelPropertyUrl(payload.data.url);
			const { property } = resolved;
			const place = property.coordinates
				? await lookupGoogleMapsPlace({ coordinates: property.coordinates, name: property.name })
				: null;
			return json({
				address: place?.address ?? property.address,
				...(property.checkInTime ? { checkInTime: property.checkInTime } : {}),
				...(property.checkOutTime ? { checkOutTime: property.checkOutTime } : {}),
				...((place?.coordinates ?? property.coordinates)
					? { coordinates: place?.coordinates ?? property.coordinates }
					: {}),
				googleHotelsUrl: payload.data.url,
				googleMapsUrl: place?.googleMapsUrl ?? googleMapsSearchUrl(property.address),
				name: property.name,
				...(place?.timeZone ? { timeZone: place.timeZone } : {})
			});
		}
		return json(parseOpenRailwayMapLocationUrl(new URL(payload.data.url)));
	} catch (error: unknown) {
		if (
			error instanceof GoogleMapsResolveError ||
			error instanceof GoogleHotelPropertyResolveError ||
			error instanceof OpenRailwayMapResolveError
		) {
			return json({ message: error.message }, { status: error.status });
		}
		return storeErrorResponse(error);
	}
};
