import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
	ExpiringCache,
	MonthlyRequestLimit,
	ProviderRateLimitError,
	ProviderRequestCoordinator,
	throwIfRateLimited
} from '$lib/server/external-api';
import { googleMapsUrlSchema, type ItineraryLocation } from '$lib/itinerary/schema';

const textSearchEndpoint = 'https://places.googleapis.com/v1/places:searchText';
const responseFieldMask =
	'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location,places.primaryType,places.timeZone';
const cacheLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1_000;
const cacheMaximumEntries = 1_000;
const fallbackRetryDelayMilliseconds = 1_000;
const mapsPlaceMaximumDistanceMetres = 100;
const mapsPlaceSearchRadiusMetres = 100;
const requestTimeoutMilliseconds = 5_000;
const defaultMonthlyRequestLimit = 4_500;

const googlePlaceSchema = z
	.object({
		displayName: z.object({ text: z.string().trim().min(1) }),
		formattedAddress: z.string().trim().min(1).optional(),
		googleMapsUri: z.string().url().optional(),
		id: z.string().trim().min(1).optional(),
		location: z
			.object({
				latitude: z.number().gte(-90).lte(90),
				longitude: z.number().gte(-180).lte(180)
			})
			.optional(),
		primaryType: z.string().trim().min(1).optional(),
		timeZone: z.string().trim().min(1).optional()
	})
	.passthrough();
const textSearchResponseSchema = z.object({ places: z.array(googlePlaceSchema).optional() }).passthrough();

export type GooglePlace = Readonly<{
	address?: string;
	coordinates?: ItineraryLocation['coordinates'];
	googleMapsUrl?: string;
	id?: string;
	name: string;
	primaryType?: string;
	timeZone?: string;
}>;

type GooglePlaceSearch = Readonly<{
	airportCode?: string;
	cacheKey: string;
	includedType?: 'airport';
	locationBias?: ItineraryLocation['coordinates'];
	pageSize: 1 | 2;
	requiredPrimaryType?: 'airport';
	strictTypeFiltering?: boolean;
	textQuery: string;
}>;

const placeCache = new ExpiringCache<GooglePlace>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<GooglePlace | null>({
	fallbackRetryDelayMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});
const monthlyRequestLimit = new MonthlyRequestLimit({ maximumRequests: configuredMonthlyRequestLimit() });

function configuredApiKey(): string | undefined {
	const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
	return apiKey || undefined;
}

function configuredMonthlyRequestLimit(): number {
	const configured = Number(env.GOOGLE_PLACES_MONTHLY_LIMIT?.trim() ?? '');
	return Number.isInteger(configured) && configured > 0 ? configured : defaultMonthlyRequestLimit;
}

function normalizedAirportCode(value: string): string | undefined {
	const code = value.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

function normalizedPlaceName(value: string): string {
	return value
		.normalize('NFKC')
		.toLocaleLowerCase('en-US')
		.replaceAll(/[^\p{L}\p{N}]+/gu, '');
}

function distanceInMetres(
	first: NonNullable<ItineraryLocation['coordinates']>,
	second: NonNullable<ItineraryLocation['coordinates']>
): number {
	const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
	const latitudeDifference = toRadians(second.latitude - first.latitude);
	const longitudeDifference = toRadians(second.longitude - first.longitude);
	const latitudeFactor = Math.sin(latitudeDifference / 2) ** 2;
	const longitudeFactor =
		Math.cos(toRadians(first.latitude)) * Math.cos(toRadians(second.latitude)) * Math.sin(longitudeDifference / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(latitudeFactor + longitudeFactor));
}

function placeFromResponse(
	payload: unknown,
	requiredPrimaryType?: GooglePlaceSearch['requiredPrimaryType']
): GooglePlace | null {
	const response = textSearchResponseSchema.safeParse(payload);
	const places = response.success
		? response.data.places?.filter(
				(place) => requiredPrimaryType === undefined || place.primaryType === requiredPrimaryType
			)
		: undefined;
	if (!places || places.length !== 1) {
		return null;
	}
	const place = places[0];
	if (!place) {
		return null;
	}

	return {
		name: place.displayName.text,
		...(place.id ? { id: place.id } : {}),
		...(place.formattedAddress ? { address: place.formattedAddress } : {}),
		...(place.googleMapsUri && googleMapsUrlSchema.safeParse(place.googleMapsUri).success
			? { googleMapsUrl: place.googleMapsUri }
			: {}),
		...(place.location
			? { coordinates: { latitude: place.location.latitude, longitude: place.location.longitude } }
			: {}),
		...(place.primaryType ? { primaryType: place.primaryType } : {}),
		...(place.timeZone ? { timeZone: place.timeZone } : {})
	};
}

async function searchGooglePlace(search: GooglePlaceSearch, apiKey: string): Promise<GooglePlace | null> {
	try {
		return await providerRequests.run(search.cacheKey, () => fetchGooglePlace(search, apiKey));
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn(
				search.airportCode
					? 'Google Places airport lookup remained rate limited after retry.'
					: 'Google Places lookup remained rate limited after retry.',
				search.airportCode
					? { airportCode: search.airportCode, responseStatus: 429 }
					: { query: search.textQuery, responseStatus: 429 }
			);
			return null;
		}
		console.warn(
			search.airportCode
				? 'Google Places airport lookup could not be completed.'
				: 'Google Places lookup could not be completed.',
			search.airportCode
				? { airportCode: search.airportCode, failure: error instanceof Error ? error.name : 'UnknownError' }
				: { query: search.textQuery, failure: error instanceof Error ? error.name : 'UnknownError' }
		);
		return null;
	}
}

async function fetchGooglePlace(search: GooglePlaceSearch, apiKey: string): Promise<GooglePlace | null> {
	if (!monthlyRequestLimit.tryAcquire()) {
		console.warn('Google Places monthly request limit reached.', { maximumRequests: configuredMonthlyRequestLimit() });
		return null;
	}
	const response = await searchGooglePlaceResponse(search, apiKey);
	if (!response.ok) {
		console.warn(
			search.airportCode ? 'Google Places airport lookup failed.' : 'Google Places lookup failed.',
			search.airportCode
				? { airportCode: search.airportCode, responseStatus: response.status }
				: { query: search.textQuery, responseStatus: response.status }
		);
		return null;
	}

	const place = placeFromResponse(await response.json().catch(() => null), search.requiredPrimaryType);
	if (!place) {
		console.warn(
			search.airportCode
				? 'Google Places did not return a usable airport location.'
				: 'Google Places did not return a usable location.',
			search.airportCode ? { airportCode: search.airportCode } : { query: search.textQuery }
		);
	}
	return place;
}

async function searchGooglePlaceResponse(search: GooglePlaceSearch, apiKey: string): Promise<Response> {
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
					...(search.includedType ? { includedType: search.includedType } : {}),
					...(search.locationBias
						? {
								locationBias: {
									circle: { center: search.locationBias, radius: mapsPlaceSearchRadiusMetres }
								}
							}
						: {}),
					pageSize: search.pageSize,
					...(search.strictTypeFiltering ? { strictTypeFiltering: true } : {}),
					textQuery: search.textQuery
				}),
				signal: controller.signal
			})
		);
	} finally {
		clearTimeout(timeout);
	}
}

async function lookupGooglePlace(search: GooglePlaceSearch): Promise<GooglePlace | null> {
	const apiKey = configuredApiKey();
	if (!apiKey) {
		return null;
	}

	const cached = placeCache.get(search.cacheKey);
	if (cached) {
		return cached;
	}

	const value = await searchGooglePlace(search, apiKey);
	if (value) {
		placeCache.set(search.cacheKey, value);
	}
	return value;
}

/** Resolves an IATA airport code to a named Google Place when Google Places is configured. */
export async function lookupGoogleAirport(code: string): Promise<GooglePlace | null> {
	const airportCode = normalizedAirportCode(code);
	if (!airportCode) {
		return null;
	}
	return lookupGooglePlace({
		airportCode,
		cacheKey: `airport:${airportCode}`,
		includedType: 'airport',
		pageSize: 2,
		requiredPrimaryType: 'airport',
		strictTypeFiltering: true,
		textQuery: `IATA ${airportCode} airport`
	});
}

/** Resolves a Google Hotels destination to one Google Places text-search result when configured. */
export async function lookupGoogleAccommodationDestination(destination: string): Promise<GooglePlace | null> {
	const query = destination.trim();
	if (!query) {
		return null;
	}
	return lookupGooglePlace({
		cacheKey: `accommodation-destination:${query.toLocaleLowerCase('en-US')}`,
		pageSize: 1,
		textQuery: query
	});
}

/** Resolves a Maps place name and coordinates only when Google Places confirms the same nearby place. */
export async function lookupGoogleMapsPlace(input: {
	coordinates: NonNullable<ItineraryLocation['coordinates']>;
	name: string;
}): Promise<GooglePlace | null> {
	const name = input.name.trim();
	if (!name) {
		return null;
	}
	const place = await lookupGooglePlace({
		cacheKey: `maps-place:${normalizedPlaceName(name)}:${input.coordinates.latitude.toFixed(5)},${input.coordinates.longitude.toFixed(5)}`,
		locationBias: input.coordinates,
		pageSize: 1,
		textQuery: name
	});
	return place &&
		place.address &&
		place.coordinates &&
		normalizedPlaceName(place.name) === normalizedPlaceName(name) &&
		distanceInMetres(input.coordinates, place.coordinates) <= mapsPlaceMaximumDistanceMetres
		? place
		: null;
}
