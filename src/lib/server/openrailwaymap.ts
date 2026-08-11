import { locationCoordinatesSchema, openRailwayMapUrlSchema, type ItineraryLocation } from '$lib/itinerary/schema';

export type OpenRailwayMapLocationImport = Readonly<{
	coordinates?: ItineraryLocation['coordinates'];
	name?: string;
	openRailwayMapUrl: string;
}>;

export class OpenRailwayMapResolveError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'OpenRailwayMapResolveError';
	}
}

function optionalQueryText(url: URL, name: string): string | undefined {
	const value = url.searchParams.get(name)?.trim();
	return value === '' || value === undefined ? undefined : value;
}

function coordinateValue(url: URL, name: 'lat' | 'lon'): number | undefined {
	const value = optionalQueryText(url, name);
	if (value === undefined) {
		return undefined;
	}

	const coordinate = Number(value);
	if (!Number.isFinite(coordinate)) {
		throw new OpenRailwayMapResolveError(422, 'The OpenRailwayMap link has invalid coordinates.');
	}
	return coordinate;
}

function coordinatesFromOpenRailwayMapUrl(url: URL): ItineraryLocation['coordinates'] | undefined {
	const latitude = coordinateValue(url, 'lat');
	const longitude = coordinateValue(url, 'lon');
	if (latitude === undefined && longitude === undefined) {
		return undefined;
	}
	if (latitude === undefined || longitude === undefined) {
		throw new OpenRailwayMapResolveError(422, 'The OpenRailwayMap link must include both latitude and longitude.');
	}

	const coordinates = locationCoordinatesSchema.safeParse({ latitude, longitude });
	if (!coordinates.success) {
		throw new OpenRailwayMapResolveError(422, 'The OpenRailwayMap link has invalid coordinates.');
	}
	return coordinates.data;
}

/** Parses the selected station name and map position contained in an OpenRailwayMap permalink. */
export function parseOpenRailwayMapLocationUrl(url: URL): OpenRailwayMapLocationImport {
	const validatedUrl = openRailwayMapUrlSchema.safeParse(url.toString());
	if (!validatedUrl.success) {
		throw new OpenRailwayMapResolveError(400, 'Use an OpenRailwayMap URL.');
	}

	const name = optionalQueryText(url, 'name');
	const coordinates = coordinatesFromOpenRailwayMapUrl(url);
	if (!name && !coordinates) {
		throw new OpenRailwayMapResolveError(
			422,
			'The OpenRailwayMap link did not include a station name or map coordinates.'
		);
	}

	return {
		openRailwayMapUrl: validatedUrl.data,
		...(name ? { name } : {}),
		...(coordinates ? { coordinates } : {})
	};
}
