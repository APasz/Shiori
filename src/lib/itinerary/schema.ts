import { z } from 'zod';
import { unixTimestampSchema } from '$lib/unix-timestamp-schema';
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
export { unixTimestampSchema };
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

function isGoogleTravelUrl(url: URL): boolean {
	return url.protocol === 'https:' && googleMapsHostnamePattern.test(url.hostname);
}

/** Returns whether a URL is a Google Hotels accommodation search. */
export function isGoogleHotelsSearchUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return isGoogleTravelUrl(url) && url.pathname === '/travel/search';
	} catch {
		return false;
	}
}

/** Returns whether a URL is a Google Hotels property page or its shareable short link. */
export function isGoogleHotelPropertyUrl(value: string): boolean {
	try {
		const url = new URL(value);
		const segments = url.pathname.split('/').filter((segment) => segment !== '');
		const isPropertyPath =
			segments.length === 4 &&
			segments[0] === 'travel' &&
			segments[1] === 'hotels' &&
			(segments[2] === 'entity' || segments[2] === 's');
		return isGoogleTravelUrl(url) && isPropertyPath && /^[A-Za-z0-9_-]{8,512}$/.test(segments[3] ?? '');
	} catch {
		return false;
	}
}

/** Returns whether a URL is a supported Google Hotels search or property link. */
export function isGoogleHotelsUrl(value: string): boolean {
	return isGoogleHotelsSearchUrl(value) || isGoogleHotelPropertyUrl(value);
}

export const googleHotelPropertyUrlSchema = z
	.string()
	.url('Use an absolute Google Hotels property URL.')
	.refine(isGoogleHotelPropertyUrl, 'Use a Google Hotels property or share link.');

export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a local time in 24-hour HH:MM form.');

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
export const currencyCodeSchema = z.enum([
	'AUD',
	'BGN',
	'BRL',
	'CAD',
	'CHF',
	'CNY',
	'CZK',
	'DKK',
	'EUR',
	'GBP',
	'HKD',
	'HUF',
	'IDR',
	'ILS',
	'INR',
	'ISK',
	'JPY',
	'KRW',
	'MXN',
	'MYR',
	'NOK',
	'NZD',
	'PHP',
	'PLN',
	'RON',
	'SEK',
	'SGD',
	'THB',
	'TRY',
	'USD',
	'ZAR'
]);
export const costStatusSchema = z.enum(['unpaid', 'paid']);
export const expenseCategorySchema = z.enum(['transport', 'accommodation', 'activity', 'food', 'misc', 'other']);
export const expenseStatusSchema = z.enum(['unpaid', 'paid']);
export const noteEntryStateSchema = z.enum(['idea', 'shortlisted', 'discarded']);

export const locationCoordinatesSchema = z.strictObject({
	latitude: z.number().gte(-90).lte(90),
	longitude: z.number().gte(-180).lte(180)
});

export const locationSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	role: locationRoleSchema,
	name: nonEmptyTextSchema,
	/** An airport or provider-specific transport-stop code. */
	code: nonEmptyTextSchema.optional(),
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

export const minorUnitAmountSchema = z
	.number()
	.int('Use a whole number of minor currency units.')
	.min(0, 'Use an amount no less than zero.')
	.max(1_000_000_000_000, 'Use an amount no greater than 1,000,000,000,000 minor units.');

const costAmountSchema = z.strictObject({
	amountMinor: minorUnitAmountSchema.min(1, 'Use an amount greater than zero.'),
	currency: currencyCodeSchema
});

const estimatedNoteCostSchema = z.strictObject({
	amountMinor: minorUnitAmountSchema.min(1, 'Use an estimated amount greater than zero.'),
	currency: currencyCodeSchema,
	id: itineraryIdentifierSchema,
	label: nonEmptyTextSchema.optional()
});

const noteEntrySchema = z
	.strictObject({
		estimatedCosts: z.array(estimatedNoteCostSchema).default([]),
		id: itineraryIdentifierSchema,
		links: z.array(itineraryLinkSchema).default([]),
		note: z.string().trim().min(1, 'The note cannot be empty.').max(10_000).optional(),
		state: noteEntryStateSchema.default('idea'),
		endTime: localTimeSchema.optional(),
		startTime: localTimeSchema.optional(),
		title: nonEmptyTextSchema
	})
	.superRefine((entry, context) => {
		if (entry.startTime !== undefined && entry.endTime !== undefined && entry.endTime < entry.startTime) {
			context.addIssue({
				code: 'custom',
				path: ['endTime'],
				message: 'The end time cannot be before the start time.'
			});
		}
	});

const itineraryNoteBaseShape = {
	entries: z.array(noteEntrySchema).default([]),
	text: z.string().max(100_000, 'Use at most 100,000 characters.').default(''),
	timeZone: ianaTimeZoneSchema
};
const noteAnchorTimestampSchema = unixTimestampSchema.refine(
	(timestamp) => timestamp % 60_000 === 0,
	'Use a Unix-millisecond timestamp aligned to a whole minute.'
);

export const itineraryNoteSchema = z.discriminatedUnion('kind', [
	z.strictObject({ ...itineraryNoteBaseShape, kind: z.literal('trip') }),
	z.strictObject({
		...itineraryNoteBaseShape,
		anchorAt: noteAnchorTimestampSchema,
		id: itineraryIdentifierSchema,
		kind: z.literal('day')
	})
]);

export const itineraryNoteTargetSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('trip') }),
	z.strictObject({ id: itineraryIdentifierSchema, kind: z.literal('day') })
]);

const expenseBaseShape = {
	amountMinor: minorUnitAmountSchema.min(1, 'Use an amount greater than zero.'),
	availableForItemCosts: z.boolean().default(false),
	category: expenseCategorySchema,
	currency: currencyCodeSchema,
	id: itineraryIdentifierSchema,
	note: z.string().trim().min(1, 'The note cannot be empty.').max(10_000).optional(),
	title: nonEmptyTextSchema,
	useDate: calendarDateSchema.optional()
};

/** A flexible, independently tracked cost that can later be allocated to itinerary items. */
export const expenseSchema = z.discriminatedUnion('status', [
	z.strictObject({ ...expenseBaseShape, status: z.literal('unpaid') }),
	z.strictObject({ ...expenseBaseShape, paidDate: calendarDateSchema, status: z.literal('paid') })
]);

const costBaseSchema = costAmountSchema.extend({
	scheduledPaymentDate: calendarDateSchema.optional()
});

export const costDraftSchema = costBaseSchema.extend({
	status: costStatusSchema
});

const costPaymentSchema = z.strictObject({
	exchangeRate: z.number().finite('Use a finite exchange rate.').positive('Use an exchange rate greater than zero.'),
	rateDate: calendarDateSchema,
	localAmountMinor: minorUnitAmountSchema,
	localCurrency: currencyCodeSchema,
	paidAt: unixTimestampSchema
});

export const costSchema = z.discriminatedUnion('status', [
	costBaseSchema.extend({ status: z.literal('unpaid') }),
	costBaseSchema.extend({ payment: costPaymentSchema, status: z.literal('paid') })
]);

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
		let previousScheduledAt: number | undefined;
		for (const [stopIndex, stop] of transport.stops.entries()) {
			if (stopLocationIds.has(stop.locationId)) {
				context.addIssue({
					code: 'custom',
					path: ['stops', stopIndex, 'locationId'],
					message: 'Each transport location can have only one stop.'
				});
			}
			stopLocationIds.add(stop.locationId);

			if (stop.scheduledAt !== undefined) {
				if (previousScheduledAt !== undefined && stop.scheduledAt < previousScheduledAt) {
					context.addIssue({
						code: 'custom',
						path: ['stops', stopIndex, 'scheduledAt'],
						message: 'Scheduled stops must be in chronological order.'
					});
				}
				previousScheduledAt = stop.scheduledAt;
			}
		}
	});

const exactTimingSchema = z.strictObject({
	kind: z.literal('exact'),
	startAt: unixTimestampSchema,
	endAt: unixTimestampSchema.optional(),
	/** The exact timestamps bound calendar dates whose local times are intentionally unknown. */
	timePrecision: z.literal('date').optional(),
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
	linkedExpenseIds: z.array(itineraryIdentifierSchema).default([]),
	documents: z.array(documentReferenceSchema).default([]),
	reservation: reservationSchema.optional(),
	cost: costSchema.optional()
};

const itineraryItemDraftBaseShape = {
	...itineraryItemBaseShape,
	cost: costDraftSchema.optional()
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

export const itineraryItemDraftSchema = z.discriminatedUnion('type', [
	z.strictObject({
		...itineraryItemDraftBaseShape,
		type: z.literal('transport'),
		transport: transportDetailsSchema
	}),
	z.strictObject({
		...itineraryItemDraftBaseShape,
		type: z.literal('activity')
	}),
	z.strictObject({
		...itineraryItemDraftBaseShape,
		type: z.literal('accommodation')
	})
]);

export const tripDetailsSchema = z.strictObject({
	title: nonEmptyTextSchema,
	timeZone: ianaTimeZoneSchema,
	localCurrency: currencyCodeSchema.default('AUD')
});

export const itinerarySchema = tripDetailsSchema
	.extend({
		expenses: z.array(expenseSchema).default([]),
		items: z.array(itineraryItemSchema),
		notes: z.array(itineraryNoteSchema).default([])
	})
	.superRefine((itinerary, context) => {
		const expenseIds = new Set<string>();
		for (const [expenseIndex, expense] of itinerary.expenses.entries()) {
			if (expenseIds.has(expense.id)) {
				context.addIssue({
					code: 'custom',
					path: ['expenses', expenseIndex, 'id'],
					message: 'Each expense ID must be unique within a trip.'
				});
			}
			expenseIds.add(expense.id);
		}

		const itemIds = new Set<string>();
		const dayNoteIds = new Set<string>();
		let hasTripNote = false;

		for (const [noteIndex, note] of itinerary.notes.entries()) {
			if (note.kind === 'trip' && hasTripNote) {
				context.addIssue({
					code: 'custom',
					path: ['notes', noteIndex],
					message: 'A trip can have only one trip note.'
				});
			}
			if (note.kind === 'day' && dayNoteIds.has(note.id)) {
				context.addIssue({
					code: 'custom',
					path: ['notes', noteIndex],
					message: 'Each day note ID must be unique within a trip.'
				});
			}
			if (note.kind === 'trip') {
				hasTripNote = true;
			} else {
				dayNoteIds.add(note.id);
			}

			const entryIds = new Set<string>();
			for (const [entryIndex, entry] of note.entries.entries()) {
				if (entryIds.has(entry.id)) {
					context.addIssue({
						code: 'custom',
						path: ['notes', noteIndex, 'entries', entryIndex, 'id'],
						message: 'Each note entry ID must be unique within a note.'
					});
				}
				entryIds.add(entry.id);

				const estimatedCostIds = new Set<string>();
				for (const [costIndex, estimatedCost] of entry.estimatedCosts.entries()) {
					if (estimatedCostIds.has(estimatedCost.id)) {
						context.addIssue({
							code: 'custom',
							path: ['notes', noteIndex, 'entries', entryIndex, 'estimatedCosts', costIndex, 'id'],
							message: 'Each estimated cost ID must be unique within a note entry.'
						});
					}
					estimatedCostIds.add(estimatedCost.id);
				}
			}
		}

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

			const linkedExpenseIds = new Set<string>();
			for (const [linkedExpenseIndex, linkedExpenseId] of item.linkedExpenseIds.entries()) {
				if (linkedExpenseIds.has(linkedExpenseId)) {
					context.addIssue({
						code: 'custom',
						path: ['items', itemIndex, 'linkedExpenseIds', linkedExpenseIndex],
						message: 'Each linked expense can be used only once per item.'
					});
				}
				if (!expenseIds.has(linkedExpenseId)) {
					context.addIssue({
						code: 'custom',
						path: ['items', itemIndex, 'linkedExpenseIds', linkedExpenseIndex],
						message: 'Each linked expense must exist within the trip.'
					});
				}
				linkedExpenseIds.add(linkedExpenseId);
			}
		}
	});

export type Itinerary = z.infer<typeof itinerarySchema>;
export type TripDetails = z.infer<typeof tripDetailsSchema>;
export type ItineraryNote = z.infer<typeof itineraryNoteSchema>;
export type DayItineraryNote = Extract<ItineraryNote, { kind: 'day' }>;
export type ItineraryNoteTarget = z.infer<typeof itineraryNoteTargetSchema>;
/** A display-date context used to create or edit a note from the itinerary UI. */
export type ItineraryNoteEditorTarget =
	| Readonly<{ kind: 'trip' }>
	| Readonly<{
			date: string;
			kind: 'day';
	  }>;
export type ItineraryNoteEntry = z.infer<typeof noteEntrySchema>;
export type EstimatedNoteCost = z.infer<typeof estimatedNoteCostSchema>;
export type NoteEntryState = z.infer<typeof noteEntryStateSchema>;
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type ItineraryItemDraft = z.infer<typeof itineraryItemDraftSchema>;
export type ItineraryItemType = z.infer<typeof itineraryItemTypeSchema>;
export type ItineraryTiming = z.infer<typeof itineraryTimingSchema>;
export type IanaTimeZone = z.infer<typeof ianaTimeZoneSchema>;
export type ItineraryLocation = z.infer<typeof locationSchema>;
export type ItineraryLink = z.infer<typeof itineraryLinkSchema>;
export type DocumentReference = z.infer<typeof documentReferenceSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type TransportDetails = z.infer<typeof transportDetailsSchema>;
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type CostAmount = z.infer<typeof costAmountSchema>;
export type Cost = z.infer<typeof costSchema>;
export type CostDraft = z.infer<typeof costDraftSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
