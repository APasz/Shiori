import { z } from 'zod';
import { isValidIanaTimeZone } from './zoned-time';

export const itineraryIdentifierSchema = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.');
const nonEmptyTextSchema = z.string().trim().min(1, 'This value cannot be empty.');
export const calendarDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')
	.refine((value) => {
		const [year, month, day] = value.split('-').map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
	}, 'Use a valid calendar date.');
export const unixTimestampSchema = z
	.number()
	.int('Use a whole Unix-millisecond timestamp.')
	.min(-8_640_000_000_000_000, 'Use a valid Unix-millisecond timestamp.')
	.max(8_640_000_000_000_000, 'Use a valid Unix-millisecond timestamp.');
export const ianaTimeZoneSchema = z
	.string()
	.trim()
	.refine(isValidIanaTimeZone, 'Use a valid IANA time zone such as Asia/Tokyo.');

export const externalUrlProtocols = ['https:', 'http:'] as const;

function hasAllowedExternalUrlProtocol(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return externalUrlProtocols.some((allowedProtocol) => allowedProtocol === protocol);
	} catch {
		return false;
	}
}

export const externalUrlSchema = z
	.string()
	.url('Use an absolute HTTP or HTTPS URL.')
	.refine(
		hasAllowedExternalUrlProtocol,
		`Use an ${externalUrlProtocols.map((protocol) => protocol.slice(0, -1)).join(' or ')} URL.`
	);

const googleMapsHostnamePattern = /^(?:(?:maps|www)\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/;
const openRailwayMapHostnamePattern = /^(?:www\.)?openrailwaymap\.org$/;

function hasGoogleMapsHostname(url: URL): boolean {
	return url.hostname === 'maps.app.goo.gl' || googleMapsHostnamePattern.test(url.hostname);
}

function hasGoogleMapsPath(url: URL): boolean {
	return (
		url.hostname === 'maps.app.goo.gl' ||
		url.hostname.startsWith('maps.') ||
		url.pathname === '/maps' ||
		url.pathname.startsWith('/maps/')
	);
}

export function isGoogleMapsUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && hasGoogleMapsHostname(url) && hasGoogleMapsPath(url);
	} catch {
		return false;
	}
}

export function isGoogleFlightsUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			googleMapsHostnamePattern.test(url.hostname) &&
			url.pathname.startsWith('/travel/flights/')
		);
	} catch {
		return false;
	}
}

export const googleMapsUrlSchema = z
	.string()
	.url('Use an absolute Google Maps URL.')
	.refine(isGoogleMapsUrl, 'Use a Google Maps or maps.app.goo.gl URL.');

function hasOpenRailwayMapPath(url: URL): boolean {
	return url.pathname === '/' || url.pathname === '/index.php' || url.pathname === '/mobile.php';
}

/** Returns whether a URL is a secure OpenRailwayMap map or permalink URL. */
export function isOpenRailwayMapUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && openRailwayMapHostnamePattern.test(url.hostname) && hasOpenRailwayMapPath(url);
	} catch {
		return false;
	}
}

export const openRailwayMapUrlSchema = z
	.string()
	.url('Use an absolute OpenRailwayMap URL.')
	.refine(isOpenRailwayMapUrl, 'Use an OpenRailwayMap URL.');

export const itineraryItemTypeSchema = z.enum(['transport', 'activity', 'accommodation']);
export const locationRoleSchema = z.enum(['primary', 'departure', 'arrival', 'via', 'meeting-point']);
export const transportModeSchema = z.enum(['air', 'bus', 'car', 'ferry', 'rail', 'ride-share', 'walk', 'other']);
export const reservationStatusSchema = z.enum(['confirmed', 'pending', 'waitlisted', 'cancelled']);
export const documentKindSchema = z.enum(['ticket', 'confirmation', 'itinerary', 'visa', 'insurance', 'other']);
export const timingKindSchema = z.enum(['exact', 'approximate', 'window']);

export const locationCoordinatesSchema = z.strictObject({
	latitude: z.number().gte(-90).lte(90),
	longitude: z.number().gte(-180).lte(180)
});

export const locationSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	role: locationRoleSchema,
	name: nonEmptyTextSchema,
	address: nonEmptyTextSchema.optional(),
	coordinates: locationCoordinatesSchema.optional(),
	googleMapsUrl: googleMapsUrlSchema.optional(),
	openRailwayMapUrl: openRailwayMapUrlSchema.optional()
});

export const itineraryLinkSchema = z.strictObject({
	label: nonEmptyTextSchema,
	url: externalUrlSchema
});

export const documentReferenceSchema = z.strictObject({
	title: nonEmptyTextSchema,
	kind: documentKindSchema,
	url: externalUrlSchema
});

export const reservationSchema = z.strictObject({
	provider: nonEmptyTextSchema.optional(),
	reference: nonEmptyTextSchema.optional(),
	status: reservationStatusSchema
});

const transportStopSchema = z.strictObject({
	locationId: itineraryIdentifierSchema,
	scheduledAt: unixTimestampSchema.optional(),
	timeZone: ianaTimeZoneSchema.optional(),
	platform: nonEmptyTextSchema.optional()
});

export const transportDetailsSchema = z
	.strictObject({
		mode: transportModeSchema,
		operator: nonEmptyTextSchema.optional(),
		serviceNumber: nonEmptyTextSchema.optional(),
		seat: nonEmptyTextSchema.optional(),
		stops: z.array(transportStopSchema).min(1, 'Transport needs at least one stop.')
	})
	.superRefine((transport, context) => {
		const stopLocationIds = new Set<string>();
		for (const [stopIndex, stop] of transport.stops.entries()) {
			if (stopLocationIds.has(stop.locationId)) {
				context.addIssue({
					code: 'custom',
					path: ['stops', stopIndex, 'locationId'],
					message: 'Each transport location can have only one stop.'
				});
			}
			stopLocationIds.add(stop.locationId);
		}
	});

const exactTimingSchema = z.strictObject({
	kind: z.literal('exact'),
	startAt: unixTimestampSchema,
	endAt: unixTimestampSchema.optional(),
	timeZone: ianaTimeZoneSchema.optional()
});
const approximateTimingSchema = z.strictObject({
	kind: z.literal('approximate'),
	nominalAt: unixTimestampSchema,
	timeZone: ianaTimeZoneSchema.optional(),
	toleranceMinutes: z
		.number()
		.int('Use a whole number of minutes.')
		.min(1, 'Use at least one minute of tolerance.')
		.max(1_440, 'Use no more than 1,440 minutes of tolerance.')
});
const windowTimingSchema = z.strictObject({
	kind: z.literal('window'),
	earliestAt: unixTimestampSchema,
	latestAt: unixTimestampSchema,
	timeZone: ianaTimeZoneSchema.optional()
});
export const itineraryTimingSchema = z
	.discriminatedUnion('kind', [exactTimingSchema, approximateTimingSchema, windowTimingSchema])
	.superRefine((timing, context) => {
		if (timing.kind === 'exact' && timing.endAt !== undefined && timing.endAt < timing.startAt) {
			context.addIssue({
				code: 'custom',
				path: ['endAt'],
				message: 'The end time cannot be before the start time.'
			});
		}

		if (timing.kind === 'window' && timing.latestAt < timing.earliestAt) {
			context.addIssue({
				code: 'custom',
				path: ['latestAt'],
				message: 'The latest time cannot be before the earliest time.'
			});
		}
	});

const itineraryItemBaseShape = {
	id: itineraryIdentifierSchema,
	timing: itineraryTimingSchema,
	title: nonEmptyTextSchema,
	locations: z.array(locationSchema).default([]),
	notes: z.array(nonEmptyTextSchema).default([]),
	links: z.array(itineraryLinkSchema).default([]),
	documents: z.array(documentReferenceSchema).default([]),
	reservation: reservationSchema.optional()
};

export const itineraryItemSchema = z.discriminatedUnion('type', [
	z.strictObject({
		...itineraryItemBaseShape,
		type: z.literal('transport'),
		transport: transportDetailsSchema
	}),
	z.strictObject({
		...itineraryItemBaseShape,
		type: z.literal('activity')
	}),
	z.strictObject({
		...itineraryItemBaseShape,
		type: z.literal('accommodation')
	})
]);

export const tripDetailsSchema = z.strictObject({
	title: nonEmptyTextSchema,
	timeZone: ianaTimeZoneSchema
});

export const itinerarySchema = tripDetailsSchema
	.extend({
		items: z.array(itineraryItemSchema)
	})
	.superRefine((itinerary, context) => {
		const itemIds = new Set<string>();

		for (const [itemIndex, item] of itinerary.items.entries()) {
			if (itemIds.has(item.id)) {
				context.addIssue({
					code: 'custom',
					path: ['items', itemIndex, 'id'],
					message: 'Each item ID must be unique within a trip.'
				});
			}
			itemIds.add(item.id);

			const locationIds = new Set<string>();
			for (const [locationIndex, location] of item.locations.entries()) {
				if (locationIds.has(location.id)) {
					context.addIssue({
						code: 'custom',
						path: ['items', itemIndex, 'locations', locationIndex, 'id'],
						message: 'Each location ID must be unique within an item.'
					});
				}
				locationIds.add(location.id);
			}

			if (item.type === 'transport') {
				for (const [stopIndex, stop] of item.transport.stops.entries()) {
					if (!locationIds.has(stop.locationId)) {
						context.addIssue({
							code: 'custom',
							path: ['items', itemIndex, 'transport', 'stops', stopIndex, 'locationId'],
							message: 'Each transport stop must reference an item location.'
						});
					}
				}
				for (const [locationIndex, location] of item.locations.entries()) {
					if (!item.transport.stops.some((stop) => stop.locationId === location.id)) {
						context.addIssue({
							code: 'custom',
							path: ['items', itemIndex, 'locations', locationIndex, 'id'],
							message: 'Each transport location needs one stop.'
						});
					}
				}
			}
		}
	});

export type Itinerary = z.infer<typeof itinerarySchema>;
export type TripDetails = z.infer<typeof tripDetailsSchema>;
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type ItineraryItemType = z.infer<typeof itineraryItemTypeSchema>;
export type ItineraryTiming = z.infer<typeof itineraryTimingSchema>;
export type IanaTimeZone = z.infer<typeof ianaTimeZoneSchema>;
export type ItineraryLocation = z.infer<typeof locationSchema>;
export type ItineraryLink = z.infer<typeof itineraryLinkSchema>;
export type DocumentReference = z.infer<typeof documentReferenceSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type TransportDetails = z.infer<typeof transportDetailsSchema>;
