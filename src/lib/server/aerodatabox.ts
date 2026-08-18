import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
	ExpiringCache,
	ProviderRateLimitError,
	ProviderRequestCoordinator,
	throwIfRateLimited
} from '$lib/server/external-api';
import { ianaTimeZoneSchema } from '$lib/itinerary/schema';
import { transportJourneyScheduleSchema, type TransportJourneySchedule } from '$lib/itinerary/transport-schedule';
import { isExampleEnvironmentValue } from './example-environment';

const directApiBaseUrl = 'https://api.aerodatabox.com/';
const rapidApiBaseUrl = 'https://aerodatabox.p.rapidapi.com/';
const rapidApiHost = 'aerodatabox.p.rapidapi.com';
const cacheLifetimeMilliseconds = 24 * 60 * 60 * 1_000;
const cacheMaximumEntries = 1_000;
const requestTimeoutMilliseconds = 5_000;
const minimumRequestIntervalMilliseconds = 1_000;

const geoCoordinatesSchema = z
	.object({
		lat: z.number().gte(-90).lte(90),
		lon: z.number().gte(-180).lte(180)
	})
	.passthrough();
const airportSchema = z
	.object({
		iata: z.string().trim().length(3).optional(),
		location: geoCoordinatesSchema.optional(),
		name: z.string().trim().min(1),
		timeZone: z.string().trim().min(1).optional()
	})
	.passthrough();
const dateTimeSchema = z
	.object({
		local: z.string().trim().min(1),
		utc: z.string().trim().min(1)
	})
	.passthrough();
const movementSchema = z
	.object({
		airport: airportSchema,
		quality: z.array(z.enum(['Basic', 'Live', 'Approximate'])).optional(),
		scheduledTime: dateTimeSchema.optional()
	})
	.passthrough();
const flightSchema = z
	.object({
		arrival: movementSchema,
		departure: movementSchema,
		number: z.string().trim().min(1)
	})
	.passthrough();
const flightsResponseSchema = z.array(flightSchema);

type AeroDataBoxAirport = Readonly<{
	coordinates?: { latitude: number; longitude: number };
	name: string;
}>;

export type AeroDataBoxFlightSchedule = Readonly<{
	arrival: AeroDataBoxAirport;
	departure: AeroDataBoxAirport;
	schedule: TransportJourneySchedule;
}>;

export type AeroDataBoxFlightLookup = Readonly<{
	arrivalIata: string;
	departureIata: string;
	flightNumber: string;
	localDate: string;
}>;

type AeroDataBoxProvider =
	Readonly<{ apiKey: string; gateway: 'direct' }> | Readonly<{ apiKey: string; gateway: 'rapidapi' }>;

const scheduleCache = new ExpiringCache<AeroDataBoxFlightSchedule>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<AeroDataBoxFlightSchedule | null>({
	fallbackRetryDelayMilliseconds: minimumRequestIntervalMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: minimumRequestIntervalMilliseconds
});

function configuredProvider(): AeroDataBoxProvider | undefined {
	const directApiKey = env.AERODATABOX_DIRECT_API_KEY?.trim();
	if (directApiKey && !isExampleEnvironmentValue('AERODATABOX_DIRECT_API_KEY', directApiKey)) {
		return { apiKey: directApiKey, gateway: 'direct' };
	}

	const rapidApiKey = env.AERODATABOX_API_KEY?.trim();
	return rapidApiKey && !isExampleEnvironmentValue('AERODATABOX_API_KEY', rapidApiKey)
		? { apiKey: rapidApiKey, gateway: 'rapidapi' }
		: undefined;
}

function normalizedFlightNumber(value: string): string {
	return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, '');
}

function normalizedAirportCode(value: string | undefined): string | undefined {
	const normalized = value?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}

function cacheKey(input: AeroDataBoxFlightLookup): string {
	return [
		normalizedFlightNumber(input.flightNumber),
		normalizedAirportCode(input.departureIata) ?? '',
		normalizedAirportCode(input.arrivalIata) ?? '',
		input.localDate
	].join(':');
}

function lookupLogContext(input: AeroDataBoxFlightLookup): Readonly<{
	arrivalIata: string;
	departureIata: string;
	flightNumber: string;
	localDate: string;
}> {
	return {
		arrivalIata: normalizedAirportCode(input.arrivalIata) ?? input.arrivalIata,
		departureIata: normalizedAirportCode(input.departureIata) ?? input.departureIata,
		flightNumber: normalizedFlightNumber(input.flightNumber),
		localDate: input.localDate
	};
}

function scheduleTimestamp(value: string): number | undefined {
	const timestamp = Date.parse(value);
	return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

function scheduledMovement(
	movement: z.infer<typeof movementSchema>,
	expectedIata: string
): { airport: AeroDataBoxAirport; schedule: TransportJourneySchedule['departure'] } | undefined {
	if (
		normalizedAirportCode(movement.airport.iata) !== normalizedAirportCode(expectedIata) ||
		movement.quality?.includes('Approximate')
	) {
		return undefined;
	}

	const timestamp = movement.scheduledTime ? scheduleTimestamp(movement.scheduledTime.utc) : undefined;
	const timeZone = ianaTimeZoneSchema.safeParse(movement.airport.timeZone);
	if (timestamp === undefined || !timeZone.success) {
		return undefined;
	}

	return {
		airport: {
			name: movement.airport.name,
			...(movement.airport.location
				? {
						coordinates: {
							latitude: movement.airport.location.lat,
							longitude: movement.airport.location.lon
						}
					}
				: {})
		},
		schedule: { scheduledAt: timestamp, timeZone: timeZone.data }
	};
}

function matchedFlight(
	flights: z.infer<typeof flightsResponseSchema>,
	input: AeroDataBoxFlightLookup
): AeroDataBoxFlightSchedule | null {
	const expectedFlightNumber = normalizedFlightNumber(input.flightNumber);
	const matches = flights.filter(
		(flight) =>
			normalizedFlightNumber(flight.number) === expectedFlightNumber &&
			normalizedAirportCode(flight.departure.airport.iata) === normalizedAirportCode(input.departureIata) &&
			normalizedAirportCode(flight.arrival.airport.iata) === normalizedAirportCode(input.arrivalIata)
	);
	if (matches.length !== 1) {
		return null;
	}

	const flight = matches[0];
	if (!flight) {
		return null;
	}
	const departure = scheduledMovement(flight.departure, input.departureIata);
	const arrival = scheduledMovement(flight.arrival, input.arrivalIata);
	if (!departure || !arrival) {
		return null;
	}

	const schedule = transportJourneyScheduleSchema.safeParse({
		departure: departure.schedule,
		arrival: arrival.schedule
	});
	return schedule.success ? { departure: departure.airport, arrival: arrival.airport, schedule: schedule.data } : null;
}

function lookupUrl(input: AeroDataBoxFlightLookup, provider: AeroDataBoxProvider): URL {
	const url = new URL(
		`flights/Number/${encodeURIComponent(normalizedFlightNumber(input.flightNumber))}/${encodeURIComponent(input.localDate)}`,
		provider.gateway === 'direct' ? directApiBaseUrl : rapidApiBaseUrl
	);
	url.searchParams.set('dateLocalRole', 'Departure');
	return url;
}

function providerHeaders(provider: AeroDataBoxProvider): HeadersInit {
	return provider.gateway === 'direct'
		? { accept: 'application/json', 'X-Api-Key': provider.apiKey }
		: {
				accept: 'application/json',
				'X-RapidAPI-Host': rapidApiHost,
				'X-RapidAPI-Key': provider.apiKey
			};
}

async function providerFlightSchedule(
	input: AeroDataBoxFlightLookup,
	provider: AeroDataBoxProvider
): Promise<AeroDataBoxFlightSchedule | null> {
	try {
		return await providerRequests.run(cacheKey(input), () => fetchProviderFlightSchedule(input, provider));
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('AeroDataBox flight schedule request remained rate limited after retry.', {
				...lookupLogContext(input),
				gateway: provider.gateway,
				responseStatus: 429
			});
			return null;
		}
		console.warn('AeroDataBox flight schedule request could not be completed.', {
			...lookupLogContext(input),
			failure: error instanceof Error ? error.name : 'UnknownError',
			gateway: provider.gateway
		});
		return null;
	}
}

async function fetchProviderFlightSchedule(
	input: AeroDataBoxFlightLookup,
	provider: AeroDataBoxProvider
): Promise<AeroDataBoxFlightSchedule | null> {
	const response = await providerFlightResponse(input, provider);
	if (response.status === 204) {
		return null;
	}
	if (!response.ok) {
		console.warn('AeroDataBox flight schedule request failed.', {
			...lookupLogContext(input),
			gateway: provider.gateway,
			responseStatus: response.status
		});
		return null;
	}
	const payload: unknown = await response.json().catch(() => null);
	const flights = flightsResponseSchema.safeParse(payload);
	if (!flights.success) {
		console.warn('AeroDataBox returned an unsupported flight schedule response.', lookupLogContext(input));
		return null;
	}
	const schedule = matchedFlight(flights.data, input);
	if (!schedule) {
		console.warn('AeroDataBox did not confirm one exact scheduled flight route.', lookupLogContext(input));
	}
	return schedule;
}

async function providerFlightResponse(
	input: AeroDataBoxFlightLookup,
	provider: AeroDataBoxProvider
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await throwIfRateLimited(
			await fetch(lookupUrl(input, provider).toString(), {
				headers: providerHeaders(provider),
				signal: controller.signal
			})
		);
	} finally {
		clearTimeout(timeout);
	}
}

/** Looks up a single, route-matched scheduled flight when AeroDataBox has been configured. */
export async function lookupAeroDataBoxFlightSchedule(
	input: AeroDataBoxFlightLookup
): Promise<AeroDataBoxFlightSchedule | null> {
	const provider = configuredProvider();
	if (!provider) {
		return null;
	}

	const key = cacheKey(input);
	const cached = scheduleCache.get(key);
	if (cached) {
		return cached;
	}

	const value = await providerFlightSchedule(input, provider);
	if (value) {
		scheduleCache.set(key, value);
	}
	return value;
}
