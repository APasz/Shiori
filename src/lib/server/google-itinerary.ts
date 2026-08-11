import { isGoogleFlightsUrl, isGoogleMapsUrl, type TransportDetails } from '$lib/itinerary/schema';
import { lookupAeroDataBoxFlightSchedule } from '$lib/server/aerodatabox';
import {
	GoogleMapsResolveError,
	googleMapsDirectionsCoordinates,
	googleMapsSearchUrl,
	parseGoogleMapsLocationUrl,
	resolveGoogleMapsUrl
} from '$lib/server/google-maps';
import { lookupGoogleAirport } from '$lib/server/google-places';
import { lookupGoogleTimeZone } from '$lib/server/google-time-zone';
import {
	lookupGoogleTransitLegs,
	type GoogleTransitLeg,
	type GoogleTransitTimingIntent
} from '$lib/server/google-transit';
import type { ItineraryItemImport } from '$lib/editing/contracts';
import { operatorNameForServicePrefix } from '$lib/itinerary/transport-operator';
import { transportRouteTitle } from '$lib/itinerary/transport-journey';
import { formatTimestampForTimeZoneInput, zonedDateTimeToUnixMilliseconds } from '$lib/itinerary/zoned-time';

const maximumRedirects = 5;
const requestTimeoutMilliseconds = 5_000;
const printableTextPattern = /[\x20-\x7e]{2,}/g;
const calendarDatePattern = /\d{4}-\d{2}-\d{2}/;
const airportCodePattern = /^([A-Z]{3})(?=[^A-Z]|$)/;
const carrierCodePattern = /^([A-Z]{2})(?=\d|[^A-Z0-9]|$)/;
const flightNumberPattern = /^(\d{1,4})(?=\D|$)/;

type FlightLeg = Readonly<{
	carrierCode?: string;
	destination: string;
	flightNumber?: string;
	origin: string;
	startDate: string;
}>;

type GoogleDirectionsEndpoints = Readonly<{
	arrival: string;
	departure: string;
}>;

type GoogleMapsTransitTiming = Readonly<{
	interpretation: 'absolute' | 'local';
	timing: GoogleTransitTimingIntent;
}>;

export class GoogleItineraryImportError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'GoogleItineraryImportError';
	}
}

function decodedPathSegment(value: string): string | undefined {
	try {
		const decoded = decodeURIComponent(value).replaceAll('+', ' ').trim();
		return decoded === '' ? undefined : decoded;
	} catch {
		return undefined;
	}
}

function googleDirectionsTravelMode(url: URL): string | null {
	const legacyDirectionFlag = url.searchParams.get('dirflg');
	return (
		url.searchParams.get('travelmode') ??
		(legacyDirectionFlag === 'd'
			? 'driving'
			: legacyDirectionFlag === 'r'
				? 'transit'
				: legacyDirectionFlag === 'w'
					? 'walking'
					: legacyDirectionFlag === 'b'
						? 'bicycling'
						: null)
	);
}

function directionsTravelMode(url: URL): TransportDetails['mode'] {
	const mode = googleDirectionsTravelMode(url);
	if (mode === 'walking' || mode === 'bicycling') {
		throw new GoogleItineraryImportError(
			422,
			'Walking and cycling directions are not imported as itinerary transport.'
		);
	}
	if (mode === 'driving') {
		return 'car';
	}
	return 'other';
}

function directionsEndpoints(url: URL): GoogleDirectionsEndpoints {
	const segments = url.pathname.split('/').filter((segment) => segment !== '');
	const directionsIndex = segments.indexOf('dir');
	const pathLocations = segments
		.slice(directionsIndex + 1)
		.map(decodedPathSegment)
		.filter((location): location is string => location !== undefined);
	const departure = url.searchParams.get('origin')?.trim() || pathLocations[0];
	const arrival = url.searchParams.get('destination')?.trim() || pathLocations[1];
	if (!departure || !arrival) {
		throw new GoogleItineraryImportError(
			422,
			'The Google Maps directions link must identify both a departure and arrival location.'
		);
	}
	return { arrival, departure };
}

function directionsImport(url: URL, endpoints: GoogleDirectionsEndpoints): ItineraryItemImport {
	const { arrival, departure } = endpoints;
	return {
		type: 'transport',
		title: transportRouteTitle(departure, arrival),
		locations: [
			{ name: departure, role: 'departure', googleMapsUrl: url.toString() },
			{ name: arrival, role: 'arrival', googleMapsUrl: url.toString() }
		],
		links: [{ label: 'Google Maps directions', url: url.toString() }],
		transport: { mode: directionsTravelMode(url) }
	};
}

function isTransitDirectionsUrl(url: URL): boolean {
	return googleDirectionsTravelMode(url) === 'transit' || url.pathname.includes('!3e3');
}

function googleMapsTransitTiming(url: URL): GoogleMapsTransitTiming | undefined {
	const timestamp = url.pathname.match(/!8j(\d{10,13})(?:!|$)/)?.[1];
	if (!timestamp) {
		return undefined;
	}
	const value = Number(timestamp);
	if (!Number.isSafeInteger(value)) {
		return undefined;
	}
	const milliseconds = timestamp.length <= 10 ? value * 1_000 : value;
	if (!Number.isSafeInteger(milliseconds) || Number.isNaN(new Date(milliseconds).getTime())) {
		return undefined;
	}

	return {
		interpretation: url.pathname.includes('!7e2') ? 'local' : 'absolute',
		timing: {
			at: milliseconds,
			kind: url.pathname.includes('!6e1') ? 'arrival' : 'departure'
		}
	};
}

async function transitTimingForLookup(
	url: URL,
	timing: GoogleMapsTransitTiming
): Promise<GoogleTransitTimingIntent | undefined> {
	if (timing.interpretation === 'absolute') {
		return timing.timing;
	}

	const coordinates = googleMapsDirectionsCoordinates(url);
	const endpointCoordinates = timing.timing.kind === 'arrival' ? coordinates.arrival : coordinates.departure;
	if (!endpointCoordinates) {
		return undefined;
	}

	const timeZone = await lookupGoogleTimeZone(endpointCoordinates, timing.timing.at);
	const localDateTime = formatTimestampForTimeZoneInput(timing.timing.at, 'UTC');
	const at = timeZone && localDateTime ? zonedDateTimeToUnixMilliseconds(localDateTime, timeZone) : null;
	return at === null ? undefined : { ...timing.timing, at };
}

function transitImport(url: URL, leg: GoogleTransitLeg): ItineraryItemImport {
	const departureGoogleMapsUrl = googleMapsSearchUrl(leg.departure.name);
	const arrivalGoogleMapsUrl = googleMapsSearchUrl(leg.arrival.name);
	return {
		type: 'transport',
		title: transportRouteTitle(leg.departure.name, leg.arrival.name),
		locations: [
			{
				name: leg.departure.name,
				role: 'departure',
				googleMapsUrl: departureGoogleMapsUrl,
				coordinates: leg.departure.coordinates
			},
			{
				name: leg.arrival.name,
				role: 'arrival',
				googleMapsUrl: arrivalGoogleMapsUrl,
				coordinates: leg.arrival.coordinates
			}
		],
		links: [{ label: 'Google Maps transit directions', url: url.toString() }],
		transport: {
			mode: leg.mode,
			...(leg.operator ? { operator: leg.operator } : {}),
			...(leg.schedule ? { schedule: leg.schedule } : {}),
			...(leg.serviceNumber ? { serviceNumber: leg.serviceNumber } : {})
		}
	};
}

async function directionsImports(url: URL): Promise<ItineraryItemImport[]> {
	const endpoints = directionsEndpoints(url);
	const fallback = directionsImport(url, endpoints);
	if (!isTransitDirectionsUrl(url)) {
		return [fallback];
	}

	const sourceTiming = googleMapsTransitTiming(url);
	if (!sourceTiming) {
		return [fallback];
	}
	const timing = await transitTimingForLookup(url, sourceTiming);
	if (!timing) {
		return [fallback];
	}

	const transitLegs = await lookupGoogleTransitLegs({
		arrivalAddress: endpoints.arrival,
		departureAddress: endpoints.departure,
		timing
	});
	return transitLegs?.map((leg) => transitImport(url, leg)) ?? [fallback];
}

function mapsPlaceImport(url: URL): ItineraryItemImport {
	const location = parseGoogleMapsLocationUrl(url);
	const name =
		location.name ??
		(location.coordinates
			? `Location at ${location.coordinates.latitude.toFixed(5)}, ${location.coordinates.longitude.toFixed(5)}`
			: 'Mapped location');
	return {
		type: 'activity',
		title: name,
		locations: [
			{
				name,
				role: 'primary',
				...(location.coordinates ? { coordinates: location.coordinates } : {}),
				googleMapsUrl: location.googleMapsUrl
			}
		],
		links: [{ label: 'Google Maps', url: location.googleMapsUrl }]
	};
}

function isDirectionsUrl(url: URL): boolean {
	return url.pathname.split('/').includes('dir');
}

function normalizedBase64(value: string): string | null {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) {
		return null;
	}
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
	return `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
}

function flightSearchStrings(tfs: string): string[] {
	const normalized = normalizedBase64(tfs);
	if (!normalized) {
		return [];
	}
	try {
		return Buffer.from(normalized, 'base64').toString('latin1').match(printableTextPattern) ?? [];
	} catch {
		return [];
	}
}

function matchedValue(value: string | undefined, pattern: RegExp): string | undefined {
	return value?.match(pattern)?.[1];
}

function parseFlightLegs(url: URL): FlightLeg[] {
	const tfs = url.searchParams.get('tfs');
	if (!tfs) {
		throw new GoogleItineraryImportError(422, 'The Google Flights link did not include a flight selection.');
	}
	const values = flightSearchStrings(tfs);
	const legs: FlightLeg[] = [];
	for (const [index, value] of values.entries()) {
		const startDate = value.match(calendarDatePattern)?.[0];
		if (!startDate) {
			continue;
		}
		const origin = matchedValue(values[index - 1], airportCodePattern);
		const destination = matchedValue(values[index + 1], airportCodePattern);
		if (!origin || !destination || origin === destination) {
			continue;
		}
		const carrierCode = matchedValue(values[index + 2], carrierCodePattern);
		const flightNumber = matchedValue(values[index + 3], flightNumberPattern);
		legs.push({
			startDate,
			origin,
			destination,
			...(carrierCode ? { carrierCode } : {}),
			...(flightNumber ? { flightNumber } : {})
		});
	}
	if (legs.length === 0) {
		throw new GoogleItineraryImportError(422, 'The Google Flights link did not contain a supported flight itinerary.');
	}
	return legs;
}

async function flightImport(url: URL, leg: FlightLeg): Promise<ItineraryItemImport> {
	const service = leg.carrierCode ? `${leg.carrierCode}${leg.flightNumber ?? ''}` : 'Flight';
	const schedule =
		leg.carrierCode && leg.flightNumber
			? await lookupAeroDataBoxFlightSchedule({
					arrivalIata: leg.destination,
					departureIata: leg.origin,
					flightNumber: service,
					localDate: leg.startDate
				})
			: null;
	const [departurePlace, arrivalPlace] = schedule
		? [null, null]
		: await Promise.all([lookupGoogleAirport(leg.origin), lookupGoogleAirport(leg.destination)]);
	const departureName = schedule?.departure.name ?? departurePlace?.name ?? leg.origin;
	const arrivalName = schedule?.arrival.name ?? arrivalPlace?.name ?? leg.destination;
	const departureCoordinates = schedule?.departure.coordinates ?? departurePlace?.coordinates;
	const arrivalCoordinates = schedule?.arrival.coordinates ?? arrivalPlace?.coordinates;
	const departureGoogleMapsUrl = departurePlace?.googleMapsUrl ?? googleMapsSearchUrl(departureName);
	const arrivalGoogleMapsUrl = arrivalPlace?.googleMapsUrl ?? googleMapsSearchUrl(arrivalName);
	return {
		type: 'transport',
		title: transportRouteTitle(departureName, arrivalName),
		suggestedStartDate: leg.startDate,
		locations: [
			{
				name: departureName,
				role: 'departure',
				googleMapsUrl: departureGoogleMapsUrl,
				...(departureCoordinates ? { coordinates: departureCoordinates } : {})
			},
			{
				name: arrivalName,
				role: 'arrival',
				googleMapsUrl: arrivalGoogleMapsUrl,
				...(arrivalCoordinates ? { coordinates: arrivalCoordinates } : {})
			}
		],
		links: [{ label: 'Google Flights', url: url.toString() }],
		transport: {
			mode: 'air',
			...(leg.carrierCode ? { operator: operatorNameForServicePrefix('air', leg.carrierCode) ?? leg.carrierCode } : {}),
			...(leg.flightNumber ? { serviceNumber: service } : {}),
			...(schedule ? { schedule: schedule.schedule } : {})
		}
	};
}

async function flightImports(url: URL): Promise<ItineraryItemImport[]> {
	return Promise.all(parseFlightLegs(url).map((leg) => flightImport(url, leg)));
}

async function fetchGoogleFlightsUrl(url: URL): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await fetch(url, { redirect: 'manual', signal: controller.signal });
	} catch {
		throw new GoogleItineraryImportError(502, 'Google Flights could not be reached. Try again later.');
	} finally {
		clearTimeout(timeout);
	}
}

async function cancelResponseBody(response: Response): Promise<void> {
	await response.body?.cancel().catch(() => undefined);
}

async function resolveGoogleFlightsUrl(inputUrl: string): Promise<URL> {
	if (!isGoogleFlightsUrl(inputUrl)) {
		throw new GoogleItineraryImportError(400, 'Use a Google Flights link.');
	}

	let currentUrl = new URL(inputUrl);
	for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
		if (currentUrl.searchParams.has('tfs')) {
			return currentUrl;
		}
		const response = await fetchGoogleFlightsUrl(currentUrl);
		if (response.status >= 300 && response.status < 400) {
			try {
				if (redirectCount === maximumRedirects) {
					throw new GoogleItineraryImportError(502, 'Google Flights redirected too many times.');
				}
				const location = response.headers.get('location');
				const nextUrl = location ? new URL(location, currentUrl) : null;
				if (!nextUrl || !isGoogleFlightsUrl(nextUrl.toString())) {
					throw new GoogleItineraryImportError(400, 'Google Flights redirected to an unsupported address.');
				}
				currentUrl = nextUrl;
			} finally {
				await cancelResponseBody(response);
			}
			continue;
		}

		await cancelResponseBody(response);
		if (!response.ok) {
			throw new GoogleItineraryImportError(502, 'Google Flights could not resolve this link.');
		}
		return currentUrl;
	}

	throw new GoogleItineraryImportError(502, 'Google Flights redirected too many times.');
}

export async function resolveGoogleItineraryUrl(inputUrl: string): Promise<ItineraryItemImport[]> {
	if (isGoogleMapsUrl(inputUrl)) {
		try {
			const inputUrlObject = new URL(inputUrl);
			const url = inputUrlObject.hostname === 'maps.app.goo.gl' ? await resolveGoogleMapsUrl(inputUrl) : inputUrlObject;
			return isDirectionsUrl(url) ? directionsImports(url) : [mapsPlaceImport(url)];
		} catch (error: unknown) {
			if (error instanceof GoogleMapsResolveError) {
				throw new GoogleItineraryImportError(error.status, error.message);
			}
			throw error;
		}
	}
	if (isGoogleFlightsUrl(inputUrl)) {
		return flightImports(await resolveGoogleFlightsUrl(inputUrl));
	}
	throw new GoogleItineraryImportError(400, 'Use a Google Maps place or directions link, or a Google Flights link.');
}
