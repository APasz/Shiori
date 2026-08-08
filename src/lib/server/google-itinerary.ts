import { isGoogleFlightsUrl, isGoogleMapsUrl, type TransportDetails } from '$lib/itinerary/schema';
import {
	GoogleMapsResolveError,
	parseGoogleMapsLocationUrl,
	resolveGoogleMapsUrl
} from '$lib/server/google-maps';
import type { ItineraryItemImport } from '$lib/editing/contracts';
import { operatorNameForServicePrefix } from '$lib/itinerary/transport-operator';

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

function directionsTravelMode(url: URL): TransportDetails['mode'] {
	const legacyDirectionFlag = url.searchParams.get('dirflg');
	const mode =
		url.searchParams.get('travelmode') ??
		(legacyDirectionFlag === 'd'
			? 'driving'
			: legacyDirectionFlag === 'r'
				? 'transit'
				: legacyDirectionFlag === 'w'
					? 'walking'
					: legacyDirectionFlag === 'b'
						? 'bicycling'
						: null);
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

function directionsImport(url: URL): ItineraryItemImport {
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

	return {
		type: 'transport',
		title: `Travel from ${departure} to ${arrival}`,
		locations: [
			{ name: departure, role: 'departure', googleMapsUrl: url.toString() },
			{ name: arrival, role: 'arrival', googleMapsUrl: url.toString() }
		],
		links: [{ label: 'Google Maps directions', url: url.toString() }],
		transport: { mode: directionsTravelMode(url) }
	};
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
		throw new GoogleItineraryImportError(
			422,
			'The Google Flights link did not include a flight selection.'
		);
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
		throw new GoogleItineraryImportError(
			422,
			'The Google Flights link did not contain a supported flight itinerary.'
		);
	}
	return legs;
}

function flightImports(url: URL): ItineraryItemImport[] {
	return parseFlightLegs(url).map((leg) => {
		const service = leg.carrierCode ? `${leg.carrierCode}${leg.flightNumber ?? ''}` : 'Flight';
		return {
			type: 'transport',
			title: `${service} from ${leg.origin} to ${leg.destination}`,
			suggestedStartDate: leg.startDate,
			locations: [
				{ name: leg.origin, role: 'departure' },
				{ name: leg.destination, role: 'arrival' }
			],
			links: [{ label: 'Google Flights', url: url.toString() }],
			transport: {
				mode: 'air',
				...(leg.carrierCode
					? { operator: operatorNameForServicePrefix('air', leg.carrierCode) ?? leg.carrierCode }
					: {}),
				...(leg.flightNumber ? { serviceNumber: leg.flightNumber } : {})
			}
		};
	});
}

async function fetchGoogleFlightsUrl(url: URL): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await fetch(url, { redirect: 'manual', signal: controller.signal });
	} catch {
		throw new GoogleItineraryImportError(
			502,
			'Google Flights could not be reached. Try again later.'
		);
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
					throw new GoogleItineraryImportError(
						400,
						'Google Flights redirected to an unsupported address.'
					);
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
			const url =
				inputUrlObject.hostname === 'maps.app.goo.gl'
					? await resolveGoogleMapsUrl(inputUrl)
					: inputUrlObject;
			return [isDirectionsUrl(url) ? directionsImport(url) : mapsPlaceImport(url)];
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
	throw new GoogleItineraryImportError(
		400,
		'Use a Google Maps place or directions link, or a Google Flights link.'
	);
}
