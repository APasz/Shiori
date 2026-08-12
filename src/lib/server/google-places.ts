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
const knowledgeGraphIdPattern = /^\/g\/[A-Za-z0-9_-]+$/;

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
	knowledgeGraphId?: string;
	name: string;
	primaryType?: string;
	timeZone?: string;
}>;

export type GoogleAirportLookup =
	| Readonly<{ kind: 'resolved'; place: GooglePlace }>
	| Readonly<{ candidates: readonly GooglePlace[]; kind: 'ambiguous' }>
	| Readonly<{ kind: 'unresolved' }>;

type GooglePlaceSearch = Readonly<{
	airportCode?: string;
	cacheKey: string;
	includedType?: 'airport' | 'lodging';
	knowledgeGraphId?: string;
	locationBias?: ItineraryLocation['coordinates'];
	pageSize: 1 | 2 | 5;
	requiredPrimaryType?: 'airport';
	strictTypeFiltering?: boolean;
	textQuery: string;
}>;

const placeCache = new ExpiringCache<GooglePlace>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const airportLookupCache = new ExpiringCache<GoogleAirportLookup>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<GooglePlace | null>({
	fallbackRetryDelayMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});
const airportProviderRequests = new ProviderRequestCoordinator<GoogleAirportLookup>({
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

type GooglePlaceResponse = Readonly<{
	candidates: GooglePlace[];
	primaryTypes: string[];
}>;

function knowledgeGraphIdFromGoogleMapsUrl(url: string | undefined): string | undefined {
	if (!url) {
		return undefined;
	}
	let decodedUrl: string;
	try {
		decodedUrl = decodeURIComponent(url);
	} catch {
		return undefined;
	}
	const id = decodedUrl.match(/\/g\/[A-Za-z0-9_-]+/)?.[0];
	return id && knowledgeGraphIdPattern.test(id) ? id : undefined;
}

function googlePlaceFromResponse(place: z.infer<typeof googlePlaceSchema>): GooglePlace {
	const googleMapsUrl =
		place.googleMapsUri && googleMapsUrlSchema.safeParse(place.googleMapsUri).success ? place.googleMapsUri : undefined;
	const knowledgeGraphId = knowledgeGraphIdFromGoogleMapsUrl(googleMapsUrl);
	return {
		name: place.displayName.text,
		...(place.id ? { id: place.id } : {}),
		...(place.formattedAddress ? { address: place.formattedAddress } : {}),
		...(googleMapsUrl ? { googleMapsUrl } : {}),
		...(knowledgeGraphId ? { knowledgeGraphId } : {}),
		...(place.location
			? { coordinates: { latitude: place.location.latitude, longitude: place.location.longitude } }
			: {}),
		...(place.primaryType ? { primaryType: place.primaryType } : {}),
		...(place.timeZone ? { timeZone: place.timeZone } : {})
	};
}

function placesFromResponse(
	payload: unknown,
	requiredPrimaryType?: GooglePlaceSearch['requiredPrimaryType']
): GooglePlaceResponse | null {
	const response = textSearchResponseSchema.safeParse(payload);
	if (!response.success) {
		return null;
	}
	const places = response.data.places ?? [];
	return {
		candidates: places
			.filter((place) => requiredPrimaryType === undefined || place.primaryType === requiredPrimaryType)
			.map(googlePlaceFromResponse),
		primaryTypes: [...new Set(places.map((place) => place.primaryType ?? 'unknown'))]
	};
}

function placeFromResponse(
	payload: unknown,
	requiredPrimaryType?: GooglePlaceSearch['requiredPrimaryType'],
	knowledgeGraphId?: string
): GooglePlace | null {
	const response = placesFromResponse(payload, requiredPrimaryType);
	const candidates = knowledgeGraphId
		? response?.candidates.filter((candidate) => candidate.knowledgeGraphId === knowledgeGraphId)
		: response?.candidates;
	return candidates?.length === 1 ? (candidates[0] ?? null) : null;
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

	const place = placeFromResponse(
		await response.json().catch(() => null),
		search.requiredPrimaryType,
		search.knowledgeGraphId
	);
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

function airportLookupFromResponse(payload: unknown, airportCode: string): GoogleAirportLookup {
	const response = placesFromResponse(payload, 'airport');
	const candidates = response?.candidates ?? [];
	if (candidates.length === 1) {
		const place = candidates[0];
		return place ? { kind: 'resolved', place } : { kind: 'unresolved' };
	}

	const context = {
		airportCode,
		candidateCount: candidates.length,
		primaryTypes: response?.primaryTypes ?? []
	};
	if (candidates.length > 1) {
		console.info('Google Places returned multiple airport candidates; user selection required.', context);
		return { candidates, kind: 'ambiguous' };
	}
	console.warn('Google Places did not return a usable airport location.', context);
	return { kind: 'unresolved' };
}

async function fetchGoogleAirport(search: GooglePlaceSearch, apiKey: string): Promise<GoogleAirportLookup> {
	if (!monthlyRequestLimit.tryAcquire()) {
		console.warn('Google Places monthly request limit reached.', { maximumRequests: configuredMonthlyRequestLimit() });
		return { kind: 'unresolved' };
	}
	const response = await searchGooglePlaceResponse(search, apiKey);
	if (!response.ok) {
		console.warn('Google Places airport lookup failed.', {
			airportCode: search.airportCode,
			responseStatus: response.status
		});
		return { kind: 'unresolved' };
	}
	return airportLookupFromResponse(await response.json().catch(() => null), search.airportCode ?? 'unknown');
}

async function searchGoogleAirport(search: GooglePlaceSearch, apiKey: string): Promise<GoogleAirportLookup> {
	try {
		return await airportProviderRequests.run(search.cacheKey, () => fetchGoogleAirport(search, apiKey));
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('Google Places airport lookup remained rate limited after retry.', {
				airportCode: search.airportCode,
				responseStatus: 429
			});
		} else {
			console.warn('Google Places airport lookup could not be completed.', {
				airportCode: search.airportCode,
				failure: error instanceof Error ? error.name : 'UnknownError'
			});
		}
		return { kind: 'unresolved' };
	}
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

/** Resolves an IATA airport code to one Google Place, or returns all ambiguous airport candidates. */
export async function lookupGoogleAirport(code: string): Promise<GoogleAirportLookup> {
	const airportCode = normalizedAirportCode(code);
	if (!airportCode) {
		return { kind: 'unresolved' };
	}
	const search: GooglePlaceSearch = {
		airportCode,
		cacheKey: `airport:${airportCode}`,
		includedType: 'airport',
		pageSize: 2,
		requiredPrimaryType: 'airport',
		strictTypeFiltering: true,
		textQuery: `IATA ${airportCode} airport`
	};
	const apiKey = configuredApiKey();
	if (!apiKey) {
		return { kind: 'unresolved' };
	}
	const cached = airportLookupCache.get(search.cacheKey);
	if (cached) {
		return cached;
	}
	const lookup = await searchGoogleAirport(search, apiKey);
	if (lookup.kind !== 'unresolved') {
		airportLookupCache.set(search.cacheKey, lookup);
	}
	return lookup;
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

/** Resolves a hotel only when Google Places returns the same Knowledge Graph entity in its Maps URL. */
export async function lookupGoogleHotelPlace(input: {
	destination?: string;
	knowledgeGraphId: string;
	name: string;
}): Promise<GooglePlace | null> {
	const destination = input.destination?.trim();
	const name = input.name.trim();
	if (!name || !knowledgeGraphIdPattern.test(input.knowledgeGraphId)) {
		return null;
	}
	return lookupGooglePlace({
		cacheKey: `hotel-property:${input.knowledgeGraphId}`,
		includedType: 'lodging',
		knowledgeGraphId: input.knowledgeGraphId,
		pageSize: 5,
		strictTypeFiltering: true,
		textQuery: destination ? `${name}, ${destination}` : name
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
