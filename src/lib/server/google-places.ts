import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
	ExpiringCache,
	ProviderRateLimitError,
	ProviderRequestCoordinator,
	throwIfRateLimited
} from '$lib/server/external-api';
import { googleMapsUrlSchema, type ItineraryLocation } from '$lib/itinerary/schema';

const textSearchEndpoint = 'https://places.googleapis.com/v1/places:searchText';
const responseFieldMask = 'places.displayName,places.googleMapsUri,places.location,places.primaryType';
const cacheLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1_000;
const cacheMaximumEntries = 1_000;
const fallbackRetryDelayMilliseconds = 1_000;
const requestTimeoutMilliseconds = 5_000;

const googlePlaceSchema = z
	.object({
		displayName: z.object({ text: z.string().trim().min(1) }),
		googleMapsUri: z.string().url().optional(),
		location: z
			.object({
				latitude: z.number().gte(-90).lte(90),
				longitude: z.number().gte(-180).lte(180)
			})
			.optional(),
		primaryType: z.literal('airport')
	})
	.passthrough();
const textSearchResponseSchema = z.object({ places: z.array(googlePlaceSchema).optional() }).passthrough();

export type GooglePlace = Readonly<{
	coordinates?: ItineraryLocation['coordinates'];
	googleMapsUrl?: string;
	name: string;
}>;

const airportCache = new ExpiringCache<GooglePlace>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<GooglePlace | null>({
	fallbackRetryDelayMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});

function configuredApiKey(): string | undefined {
	const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
	return apiKey || undefined;
}

function normalizedAirportCode(value: string): string | undefined {
	const code = value.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

function airportFromResponse(payload: unknown): GooglePlace | null {
	const response = textSearchResponseSchema.safeParse(payload);
	const places = response.success ? response.data.places : undefined;
	if (!places || places.length !== 1) {
		return null;
	}
	const place = places[0];
	if (!place) {
		return null;
	}

	return {
		name: place.displayName.text,
		...(place.googleMapsUri && googleMapsUrlSchema.safeParse(place.googleMapsUri).success
			? { googleMapsUrl: place.googleMapsUri }
			: {}),
		...(place.location
			? { coordinates: { latitude: place.location.latitude, longitude: place.location.longitude } }
			: {})
	};
}

async function searchAirport(code: string, apiKey: string): Promise<GooglePlace | null> {
	try {
		return await providerRequests.run(code, () => fetchAirport(code, apiKey));
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('Google Places airport lookup remained rate limited after retry.', {
				airportCode: code,
				responseStatus: 429
			});
			return null;
		}
		console.warn('Google Places airport lookup could not be completed.', {
			airportCode: code,
			failure: error instanceof Error ? error.name : 'UnknownError'
		});
		return null;
	}
}

async function fetchAirport(code: string, apiKey: string): Promise<GooglePlace | null> {
	const response = await searchAirportResponse(code, apiKey);
	if (!response.ok) {
		console.warn('Google Places airport lookup failed.', { airportCode: code, responseStatus: response.status });
		return null;
	}

	const place = airportFromResponse(await response.json().catch(() => null));
	if (!place) {
		console.warn('Google Places did not return a usable airport location.', { airportCode: code });
	}
	return place;
}

async function searchAirportResponse(code: string, apiKey: string): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await throwIfRateLimited(
			await fetch(textSearchEndpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'X-Goog-Api-Key': apiKey,
					'X-Goog-FieldMask': responseFieldMask
				},
				body: JSON.stringify({
					includedType: 'airport',
					pageSize: 2,
					strictTypeFiltering: true,
					textQuery: `IATA ${code} airport`
				}),
				signal: controller.signal
			})
		);
	} finally {
		clearTimeout(timeout);
	}
}

/** Resolves an IATA airport code to a named Google Place when Google Places is configured. */
export async function lookupGoogleAirport(code: string): Promise<GooglePlace | null> {
	const airportCode = normalizedAirportCode(code);
	const apiKey = configuredApiKey();
	if (!airportCode || !apiKey) {
		return null;
	}

	const cached = airportCache.get(airportCode);
	if (cached) {
		return cached;
	}

	const value = await searchAirport(airportCode, apiKey);
	if (value) {
		airportCache.set(airportCode, value);
	}
	return value;
}
