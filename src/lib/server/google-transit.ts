import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
	ExpiringCache,
	ProviderRateLimitError,
	ProviderRequestCoordinator,
	throwIfRateLimited
} from '$lib/server/external-api';
import { ianaTimeZoneSchema, type ItineraryLocation, type TransportDetails } from '$lib/itinerary/schema';
import { transportJourneyScheduleSchema, type TransportJourneySchedule } from '$lib/itinerary/transport-schedule';

const computeRoutesEndpoint = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const responseFieldMask = 'routes.legs.steps.transitDetails';
const cacheLifetimeMilliseconds = 15 * 60 * 1_000;
const cacheMaximumEntries = 500;
const fallbackRetryDelayMilliseconds = 1_000;
const requestTimeoutMilliseconds = 5_000;

const coordinatesSchema = z
	.object({
		latitude: z.number().gte(-90).lte(90),
		longitude: z.number().gte(-180).lte(180)
	})
	.passthrough();
const transitStopSchema = z
	.object({
		location: z.object({ latLng: coordinatesSchema }).passthrough(),
		name: z.string().trim().min(1)
	})
	.passthrough();
const transitStopDetailsSchema = z
	.object({
		arrivalStop: transitStopSchema,
		arrivalTime: z.string().trim().min(1),
		departureStop: transitStopSchema,
		departureTime: z.string().trim().min(1)
	})
	.passthrough();
const localizedTransitTimeSchema = z.object({ timeZone: z.string().trim().min(1) }).passthrough();
const transitLocalizedValuesSchema = z
	.object({
		arrivalTime: localizedTransitTimeSchema.optional(),
		departureTime: localizedTransitTimeSchema.optional()
	})
	.passthrough();
const transitLineSchema = z
	.object({
		agencies: z.array(z.object({ name: z.string().trim().min(1) }).passthrough()).optional(),
		name: z.string().trim().min(1).optional(),
		nameShort: z.string().trim().min(1).optional(),
		vehicle: z
			.object({ type: z.string().trim().min(1) })
			.passthrough()
			.optional()
	})
	.passthrough();
const transitDetailsSchema = z
	.object({
		localizedValues: transitLocalizedValuesSchema.optional(),
		stopDetails: transitStopDetailsSchema,
		transitLine: transitLineSchema
	})
	.passthrough();
const routesResponseSchema = z
	.object({
		routes: z
			.array(
				z
					.object({
						legs: z.array(
							z
								.object({
									steps: z.array(z.object({ transitDetails: transitDetailsSchema.optional() }).passthrough())
								})
								.passthrough()
						)
					})
					.passthrough()
			)
			.optional()
	})
	.passthrough();

type TransitDetails = z.infer<typeof transitDetailsSchema>;

export type GoogleTransitTimingIntent = Readonly<{
	at: number;
	kind: 'arrival' | 'departure';
}>;

export type GoogleTransitLookup = Readonly<{
	arrivalAddress: string;
	departureAddress: string;
	timing: GoogleTransitTimingIntent;
}>;

type GoogleTransitStop = Readonly<{
	coordinates: ItineraryLocation['coordinates'];
	name: string;
}>;

export type GoogleTransitLeg = Readonly<{
	arrival: GoogleTransitStop;
	departure: GoogleTransitStop;
	mode: TransportDetails['mode'];
	operator?: string;
	schedule?: TransportJourneySchedule;
	serviceNumber?: string;
}>;

const transitCache = new ExpiringCache<readonly GoogleTransitLeg[]>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<readonly GoogleTransitLeg[] | null>({
	fallbackRetryDelayMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});

function configuredApiKey(): string | undefined {
	const apiKey = env.GOOGLE_ROUTES_API_KEY?.trim();
	return apiKey || undefined;
}

function normalizedAddress(value: string): string | undefined {
	const address = value.trim();
	return address || undefined;
}

function lookupCacheKey(input: GoogleTransitLookup): string | undefined {
	const departureAddress = normalizedAddress(input.departureAddress);
	const arrivalAddress = normalizedAddress(input.arrivalAddress);
	if (!departureAddress || !arrivalAddress || !Number.isSafeInteger(input.timing.at)) {
		return undefined;
	}
	return [departureAddress.toLowerCase(), arrivalAddress.toLowerCase(), input.timing.kind, input.timing.at].join(':');
}

function lookupLogContext(input: GoogleTransitLookup): Readonly<{ timing: GoogleTransitTimingIntent }> {
	return { timing: input.timing };
}

function transportModeForVehicleType(vehicleType: string | undefined): TransportDetails['mode'] {
	switch (vehicleType) {
		case 'BUS':
		case 'INTERCITY_BUS':
		case 'SHARE_TAXI':
		case 'TROLLEYBUS':
			return 'bus';
		case 'FERRY':
			return 'ferry';
		case 'COMMUTER_TRAIN':
		case 'HEAVY_RAIL':
		case 'HIGH_SPEED_TRAIN':
		case 'LONG_DISTANCE_TRAIN':
		case 'METRO_RAIL':
		case 'MONORAIL':
		case 'RAIL':
		case 'SUBWAY':
		case 'TRAM':
			return 'rail';
		default:
			return 'other';
	}
}

function stopFromResponse(stop: z.infer<typeof transitStopSchema>): GoogleTransitStop {
	return {
		coordinates: {
			latitude: stop.location.latLng.latitude,
			longitude: stop.location.latLng.longitude
		},
		name: stop.name
	};
}

function scheduledAt(value: string): number | undefined {
	const timestamp = Date.parse(value);
	return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

function scheduleFromTransitDetails(details: TransitDetails): TransportJourneySchedule | undefined {
	const departureAt = scheduledAt(details.stopDetails.departureTime);
	const arrivalAt = scheduledAt(details.stopDetails.arrivalTime);
	const departureTimeZone = ianaTimeZoneSchema.safeParse(details.localizedValues?.departureTime?.timeZone);
	const arrivalTimeZone = ianaTimeZoneSchema.safeParse(details.localizedValues?.arrivalTime?.timeZone);
	if (departureAt === undefined || arrivalAt === undefined || !departureTimeZone.success || !arrivalTimeZone.success) {
		return undefined;
	}

	const schedule = transportJourneyScheduleSchema.safeParse({
		arrival: { scheduledAt: arrivalAt, timeZone: arrivalTimeZone.data },
		departure: { scheduledAt: departureAt, timeZone: departureTimeZone.data }
	});
	return schedule.success ? schedule.data : undefined;
}

function operatorFromTransitDetails(details: TransitDetails): string | undefined {
	const agencies = details.transitLine.agencies ?? [];
	return agencies.length === 1 ? agencies[0]?.name : undefined;
}

function transitLegFromDetails(details: TransitDetails): GoogleTransitLeg {
	const operator = operatorFromTransitDetails(details);
	const serviceNumber = details.transitLine.nameShort ?? details.transitLine.name;
	const schedule = scheduleFromTransitDetails(details);
	return {
		arrival: stopFromResponse(details.stopDetails.arrivalStop),
		departure: stopFromResponse(details.stopDetails.departureStop),
		mode: transportModeForVehicleType(details.transitLine.vehicle?.type),
		...(operator ? { operator } : {}),
		...(schedule ? { schedule } : {}),
		...(serviceNumber ? { serviceNumber } : {})
	};
}

function transitLegsFromResponse(payload: unknown): readonly GoogleTransitLeg[] | null {
	const response = routesResponseSchema.safeParse(payload);
	const route = response.success ? response.data.routes?.[0] : undefined;
	if (!route) {
		return null;
	}

	const transitDetails = route.legs.flatMap((leg) =>
		leg.steps.flatMap((step) => (step.transitDetails ? [step.transitDetails] : []))
	);
	return transitDetails.map(transitLegFromDetails);
}

async function requestTransitLegs(
	input: GoogleTransitLookup,
	apiKey: string
): Promise<readonly GoogleTransitLeg[] | null> {
	try {
		return await providerRequests.run(lookupCacheKey(input) ?? '', () => fetchTransitLegs(input, apiKey));
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('Google Routes transit request remained rate limited after retry.', {
				...lookupLogContext(input),
				responseStatus: 429
			});
			return null;
		}
		console.warn('Google Routes transit request could not be completed.', {
			...lookupLogContext(input),
			failure: error instanceof Error ? error.name : 'UnknownError'
		});
		return null;
	}
}

async function fetchTransitLegs(
	input: GoogleTransitLookup,
	apiKey: string
): Promise<readonly GoogleTransitLeg[] | null> {
	const response = await transitResponse(input, apiKey);
	if (!response.ok) {
		console.warn('Google Routes transit request failed.', {
			...lookupLogContext(input),
			responseStatus: response.status
		});
		return null;
	}

	const transitLegs = transitLegsFromResponse(await response.json().catch(() => null));
	if (!transitLegs || transitLegs.length === 0) {
		console.warn('Google Routes did not return usable transit legs.', lookupLogContext(input));
		return null;
	}
	return transitLegs;
}

async function transitResponse(input: GoogleTransitLookup, apiKey: string): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await throwIfRateLimited(
			await fetch(computeRoutesEndpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'X-Goog-Api-Key': apiKey,
					'X-Goog-FieldMask': responseFieldMask
				},
				body: JSON.stringify({
					destination: { address: input.arrivalAddress },
					...(input.timing.kind === 'arrival'
						? { arrivalTime: new Date(input.timing.at).toISOString() }
						: { departureTime: new Date(input.timing.at).toISOString() }),
					origin: { address: input.departureAddress },
					travelMode: 'TRANSIT'
				}),
				signal: controller.signal
			})
		);
	} finally {
		clearTimeout(timeout);
	}
}

/** Looks up scheduled transit vehicle legs when Google Routes API is configured. */
export async function lookupGoogleTransitLegs(input: GoogleTransitLookup): Promise<readonly GoogleTransitLeg[] | null> {
	const key = lookupCacheKey(input);
	const apiKey = configuredApiKey();
	if (!key || !apiKey) {
		return null;
	}

	const cached = transitCache.get(key);
	if (cached) {
		return cached;
	}

	const value = await requestTransitLegs(input, apiKey);
	if (value) {
		transitCache.set(key, value);
	}
	return value;
}
