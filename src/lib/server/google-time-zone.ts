import { z } from 'zod';
import {
	ExpiringCache,
	ProviderRateLimitError,
	ProviderRequestCoordinator,
	throwIfRateLimited
} from '$lib/server/external-api';
import { ianaTimeZoneSchema, locationCoordinatesSchema } from '$lib/itinerary/schema';
import { configuredGoogleApiKey } from '$lib/server/google-api-key';

const timeZoneEndpoint = 'https://maps.googleapis.com/maps/api/timezone/json';
const cacheLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1_000;
const cacheMaximumEntries = 1_000;
const fallbackRetryDelayMilliseconds = 1_000;
const requestTimeoutMilliseconds = 5_000;

const timeZoneResponseSchema = z
	.object({
		status: z.string().trim().min(1),
		timeZoneId: z.string().trim().min(1).optional()
	})
	.passthrough();

type Coordinates = z.output<typeof locationCoordinatesSchema>;

const timeZoneCache = new ExpiringCache<string>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<string | null>({
	fallbackRetryDelayMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});

function configuredApiKey(): string | undefined {
	return configuredGoogleApiKey('timeZone');
}

function normalizedCoordinates(value: Coordinates | undefined): Coordinates | undefined {
	const coordinates = locationCoordinatesSchema.safeParse(value);
	return coordinates.success ? coordinates.data : undefined;
}

function lookupCacheKey(coordinates: Coordinates, timestamp: number): string | undefined {
	if (!Number.isSafeInteger(timestamp)) {
		return undefined;
	}
	const dateValue = new Date(timestamp);
	if (Number.isNaN(dateValue.getTime())) {
		return undefined;
	}
	const date = dateValue.toISOString().slice(0, 10);
	return [coordinates.latitude, coordinates.longitude, date].join(':');
}

function lookupLogContext(
	coordinates: Coordinates,
	timestamp: number
): Readonly<{ coordinates: Coordinates; timestamp: number }> {
	return { coordinates, timestamp };
}

function timeZoneFromResponse(payload: unknown): string | null {
	const response = timeZoneResponseSchema.safeParse(payload);
	if (!response.success || response.data.status !== 'OK') {
		return null;
	}
	const timeZone = ianaTimeZoneSchema.safeParse(response.data.timeZoneId);
	return timeZone.success ? timeZone.data : null;
}

async function requestTimeZone(coordinates: Coordinates, timestamp: number, apiKey: string): Promise<string | null> {
	const key = lookupCacheKey(coordinates, timestamp);
	if (!key) {
		return null;
	}

	try {
		return await providerRequests.run(key, () => fetchTimeZone(coordinates, timestamp, apiKey));
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('Google Time Zone lookup remained rate limited after retry.', {
				...lookupLogContext(coordinates, timestamp),
				responseStatus: 429
			});
			return null;
		}
		console.warn('Google Time Zone lookup could not be completed.', {
			...lookupLogContext(coordinates, timestamp),
			failure: error instanceof Error ? error.name : 'UnknownError'
		});
		return null;
	}
}

async function fetchTimeZone(coordinates: Coordinates, timestamp: number, apiKey: string): Promise<string | null> {
	const response = await timeZoneResponse(coordinates, timestamp, apiKey);
	if (!response.ok) {
		console.warn('Google Time Zone lookup failed.', {
			...lookupLogContext(coordinates, timestamp),
			responseStatus: response.status
		});
		return null;
	}

	const timeZone = timeZoneFromResponse(await response.json().catch(() => null));
	if (!timeZone) {
		console.warn('Google Time Zone did not return a usable IANA time zone.', lookupLogContext(coordinates, timestamp));
	}
	return timeZone;
}

async function timeZoneResponse(coordinates: Coordinates, timestamp: number, apiKey: string): Promise<Response> {
	const requestUrl = new URL(timeZoneEndpoint);
	requestUrl.searchParams.set('key', apiKey);
	requestUrl.searchParams.set('location', `${coordinates.latitude},${coordinates.longitude}`);
	requestUrl.searchParams.set('timestamp', String(Math.floor(timestamp / 1_000)));

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await throwIfRateLimited(await fetch(requestUrl, { signal: controller.signal }));
	} finally {
		clearTimeout(timeout);
	}
}

/** Resolves the IANA time zone at a Google Maps coordinate when the Time Zone API is configured. */
export async function lookupGoogleTimeZone(
	coordinates: Coordinates | undefined,
	timestamp: number
): Promise<string | null> {
	const normalized = normalizedCoordinates(coordinates);
	const key = normalized ? lookupCacheKey(normalized, timestamp) : undefined;
	const apiKey = configuredApiKey();
	if (!normalized || !key || !apiKey) {
		return null;
	}

	const cached = timeZoneCache.get(key);
	if (cached) {
		return cached;
	}

	const value = await requestTimeZone(normalized, timestamp, apiKey);
	if (value) {
		timeZoneCache.set(key, value);
	}
	return value;
}
