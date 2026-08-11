import { googleMapsUrlSchema, isGoogleMapsUrl, type ItineraryLocation } from '$lib/itinerary/schema';

const maximumRedirects = 5;
const requestTimeoutMilliseconds = 5_000;

export type GoogleMapsLocationImport = Readonly<{
	coordinates?: ItineraryLocation['coordinates'];
	googleMapsUrl: string;
	name?: string;
}>;

export type GoogleMapsDirectionsCoordinates = Readonly<{
	arrival?: ItineraryLocation['coordinates'];
	departure?: ItineraryLocation['coordinates'];
}>;

/** Creates a validated Google Maps search link for a known location name. */
export function googleMapsSearchUrl(query: string): string {
	const url = new URL('https://www.google.com/maps/search/');
	url.searchParams.set('api', '1');
	url.searchParams.set('query', query);
	return googleMapsUrlSchema.parse(url.toString());
}

export class GoogleMapsResolveError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'GoogleMapsResolveError';
	}
}

function coordinateValue(latitude: string, longitude: string): ItineraryLocation['coordinates'] {
	const parsedLatitude = Number(latitude);
	const parsedLongitude = Number(longitude);
	return Number.isFinite(parsedLatitude) &&
		Number.isFinite(parsedLongitude) &&
		parsedLatitude >= -90 &&
		parsedLatitude <= 90 &&
		parsedLongitude >= -180 &&
		parsedLongitude <= 180
		? { latitude: parsedLatitude, longitude: parsedLongitude }
		: undefined;
}

function coordinatesFromValue(value: string): ItineraryLocation['coordinates'] {
	const match = value.match(/^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*$/);
	return match ? coordinateValue(match[1], match[2]) : undefined;
}

function decodePathSegment(value: string): string | undefined {
	try {
		const decoded = decodeURIComponent(value).replaceAll('+', ' ').trim();
		return decoded === '' ? undefined : decoded;
	} catch {
		return undefined;
	}
}

function nameFromGoogleMapsUrl(url: URL): string | undefined {
	const pathSegments = url.pathname.split('/').filter((segment) => segment !== '');
	const placeIndex = pathSegments.indexOf('place');
	const placeName = placeIndex === -1 ? undefined : pathSegments[placeIndex + 1];
	if (placeName) {
		return decodePathSegment(placeName);
	}

	for (const parameterName of ['query', 'q']) {
		const parameter = url.searchParams.get(parameterName)?.trim();
		if (parameter && !coordinatesFromValue(parameter)) {
			return parameter;
		}
	}

	return undefined;
}

function coordinatesFromGoogleMapsUrl(url: URL): ItineraryLocation['coordinates'] {
	const directCoordinates = url.toString().match(/!3d(-?(?:\d+(?:\.\d+)?|\.\d+))!4d(-?(?:\d+(?:\.\d+)?|\.\d+))/);
	if (directCoordinates) {
		return coordinateValue(directCoordinates[1], directCoordinates[2]);
	}

	for (const parameterName of ['query', 'q', 'll', 'center']) {
		const parameter = url.searchParams.get(parameterName);
		if (parameter) {
			const coordinates = coordinatesFromValue(parameter);
			if (coordinates) {
				return coordinates;
			}
		}
	}

	return undefined;
}

/** Extracts endpoint coordinates embedded in a Google Maps directions URL. */
export function googleMapsDirectionsCoordinates(url: URL): GoogleMapsDirectionsCoordinates {
	const coordinatePairs = [...url.pathname.matchAll(/!1d(-?(?:\d+(?:\.\d+)?|\.\d+))!2d(-?(?:\d+(?:\.\d+)?|\.\d+))/g)];
	const [departureMatch, arrivalMatch] = coordinatePairs;
	const departure = departureMatch ? coordinateValue(departureMatch[2], departureMatch[1]) : undefined;
	const arrival = arrivalMatch ? coordinateValue(arrivalMatch[2], arrivalMatch[1]) : undefined;
	return {
		...(departure ? { departure } : {}),
		...(arrival ? { arrival } : {})
	};
}

export function parseGoogleMapsLocationUrl(url: URL): GoogleMapsLocationImport {
	const validatedUrl = googleMapsUrlSchema.safeParse(url.toString());
	if (!validatedUrl.success) {
		throw new GoogleMapsResolveError(400, 'Use a Google Maps or maps.app.goo.gl URL.');
	}

	const name = nameFromGoogleMapsUrl(url);
	const coordinates = coordinatesFromGoogleMapsUrl(url);
	if (!name && !coordinates) {
		throw new GoogleMapsResolveError(422, 'The Google Maps link did not include a place name or coordinates.');
	}

	return {
		...(coordinates ? { coordinates } : {}),
		googleMapsUrl: validatedUrl.data,
		...(name ? { name } : {})
	};
}

async function fetchGoogleMapsUrl(url: URL): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await fetch(url, { redirect: 'manual', signal: controller.signal });
	} catch {
		throw new GoogleMapsResolveError(502, 'Google Maps could not be reached. Try again later.');
	} finally {
		clearTimeout(timeout);
	}
}

function redirectUrl(response: Response, currentUrl: URL): URL {
	const location = response.headers.get('location');
	if (!location) {
		throw new GoogleMapsResolveError(502, 'Google Maps returned an invalid redirect.');
	}

	try {
		const nextUrl = new URL(location, currentUrl);
		if (!isGoogleMapsUrl(nextUrl.toString())) {
			throw new GoogleMapsResolveError(400, 'Google Maps redirected to an unsupported address.');
		}
		return nextUrl;
	} catch (error: unknown) {
		if (error instanceof GoogleMapsResolveError) {
			throw error;
		}
		throw new GoogleMapsResolveError(502, 'Google Maps returned an invalid redirect.');
	}
}

async function cancelResponseBody(response: Response): Promise<void> {
	await response.body?.cancel().catch(() => undefined);
}

export async function resolveGoogleMapsLocation(inputUrl: string): Promise<GoogleMapsLocationImport> {
	return parseGoogleMapsLocationUrl(await resolveGoogleMapsUrl(inputUrl));
}

export async function resolveGoogleMapsUrl(inputUrl: string): Promise<URL> {
	const input = googleMapsUrlSchema.safeParse(inputUrl);
	if (!input.success) {
		throw new GoogleMapsResolveError(400, 'Use a Google Maps or maps.app.goo.gl URL.');
	}

	let currentUrl = new URL(input.data);
	for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
		const response = await fetchGoogleMapsUrl(currentUrl);
		if (response.status >= 300 && response.status < 400) {
			try {
				if (redirectCount === maximumRedirects) {
					throw new GoogleMapsResolveError(502, 'Google Maps redirected too many times.');
				}
				currentUrl = redirectUrl(response, currentUrl);
			} finally {
				await cancelResponseBody(response);
			}
			continue;
		}

		await cancelResponseBody(response);
		if (!response.ok) {
			throw new GoogleMapsResolveError(502, 'Google Maps could not resolve this link.');
		}

		return currentUrl;
	}

	throw new GoogleMapsResolveError(502, 'Google Maps redirected too many times.');
}
