import { z } from 'zod';
import {
	calendarDateSchema,
	currencyCodeSchema,
	expenseSchema,
	externalUrlSchema,
	googleHotelPropertyUrlSchema,
	googleMapsUrlSchema,
	ianaTimeZoneSchema,
	itineraryIdentifierSchema,
	itineraryItemDraftSchema,
	itineraryLinkSchema,
	itineraryNoteSchema,
	itineraryNoteTargetSchema,
	locationRoleSchema,
	locationCoordinatesSchema,
	localTimeSchema,
	openRailwayMapUrlSchema,
	transportModeSchema,
	tripDetailsSchema,
	unixTimestampSchema
} from '$lib/itinerary/schema';
import { transportJourneyScheduleSchema } from '$lib/itinerary/transport-schedule';

export const editLockResponseSchema = z.strictObject({
	expiresAt: unixTimestampSchema,
	revisionAtStart: z.number().int().nonnegative(),
	token: z.string().uuid()
});

export const editSaveRequestSchema = z.strictObject({
	item: itineraryItemDraftSchema,
	lockToken: z.string().uuid(),
	revision: z.number().int().nonnegative()
});

export const editSaveResponseSchema = z.strictObject({
	revision: z.number().int().nonnegative()
});

export const tripCreateRequestSchema = z.strictObject({
	details: tripDetailsSchema
});

export const tripCreateResponseSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	slug: itineraryIdentifierSchema
});

export const tripDetailsSaveRequestSchema = z.strictObject({
	details: tripDetailsSchema,
	revision: z.number().int().nonnegative()
});

export const expenseSaveRequestSchema = z.strictObject({
	expense: expenseSchema,
	revision: z.number().int().nonnegative()
});

export const expenseDeleteRequestSchema = z.strictObject({
	expenseId: itineraryIdentifierSchema,
	revision: z.number().int().nonnegative()
});

export const noteSaveRequestSchema = z.strictObject({
	note: itineraryNoteSchema,
	revision: z.number().int().nonnegative()
});

export const noteTargetSchema = itineraryNoteTargetSchema;

export const noteDeleteRequestSchema = z.strictObject({
	target: noteTargetSchema,
	revision: z.number().int().nonnegative()
});

export const currencyConversionRatesRequestSchema = z
	.strictObject({
		sourceCurrencies: z.array(currencyCodeSchema).min(1).max(currencyCodeSchema.options.length),
		targetCurrency: currencyCodeSchema
	})
	.refine(
		(input) => new Set(input.sourceCurrencies).size === input.sourceCurrencies.length,
		'Source currencies must be unique.'
	);

const currencyConversionRateSchema = z.strictObject({
	sourceCurrency: currencyCodeSchema,
	targetCurrencyPerSourceCurrency: z.number().finite().positive()
});

export const currencyConversionRatesResponseSchema = z.strictObject({
	effectiveDate: calendarDateSchema,
	rates: z.array(currencyConversionRateSchema).min(1),
	targetCurrency: currencyCodeSchema
});

export const itemCreateRequestSchema = z.strictObject({
	item: itineraryItemDraftSchema,
	lockToken: z.string().uuid(),
	revision: z.number().int().nonnegative()
});

export const itemMutationRequestSchema = z.strictObject({
	action: z.literal('delete'),
	itemId: itineraryIdentifierSchema,
	revision: z.number().int().nonnegative()
});

export const editLockTokenRequestSchema = z.strictObject({
	lockToken: z.string().uuid()
});

const locationMapUrlSchema = z.union([googleMapsUrlSchema, googleHotelPropertyUrlSchema, openRailwayMapUrlSchema]);

export const locationResolveRequestSchema = z.strictObject({
	url: locationMapUrlSchema
});

export const locationResolveResponseSchema = z
	.strictObject({
		address: z.string().trim().min(1).optional(),
		checkInTime: localTimeSchema.optional(),
		checkOutTime: localTimeSchema.optional(),
		coordinates: locationCoordinatesSchema.optional(),
		googleHotelsUrl: googleHotelPropertyUrlSchema.optional(),
		googleMapsUrl: googleMapsUrlSchema.optional(),
		name: z.string().trim().min(1).optional(),
		openRailwayMapUrl: openRailwayMapUrlSchema.optional(),
		timeZone: ianaTimeZoneSchema.optional()
	})
	.refine(
		(location) => location.googleMapsUrl !== undefined || location.openRailwayMapUrl !== undefined,
		'Include a Google Maps or OpenRailwayMap URL.'
	);

export const itineraryItemImportRequestSchema = z.strictObject({
	url: externalUrlSchema
});

const importedAirportCandidateSchema = z.strictObject({
	address: z.string().trim().min(1).optional(),
	coordinates: locationCoordinatesSchema.optional(),
	googleMapsUrl: googleMapsUrlSchema.optional(),
	name: z.string().trim().min(1)
});

const importedLocationSchema = z.strictObject({
	address: z.string().trim().min(1).optional(),
	airportCandidates: z.array(importedAirportCandidateSchema).min(2).optional(),
	code: z.string().trim().min(1).optional(),
	coordinates: locationCoordinatesSchema.optional(),
	googleMapsUrl: googleMapsUrlSchema.optional(),
	name: z.string().trim().min(1),
	openRailwayMapUrl: openRailwayMapUrlSchema.optional(),
	role: locationRoleSchema
});

const importedItemBaseShape = {
	links: z.array(itineraryLinkSchema).min(1),
	locations: z.array(importedLocationSchema),
	suggestedEndDate: calendarDateSchema.optional(),
	suggestedStartDate: calendarDateSchema.optional(),
	title: z.string().trim().min(1)
};

const accommodationPropertyStatusSchema = z.enum(['confirmed', 'area-only', 'unconfirmed']);

export const itineraryItemImportSchema = z.discriminatedUnion('type', [
	z.strictObject({ ...importedItemBaseShape, type: z.literal('activity') }),
	z.strictObject({
		...importedItemBaseShape,
		propertyStatus: accommodationPropertyStatusSchema,
		suggestedCheckInTime: localTimeSchema.optional(),
		suggestedCheckOutTime: localTimeSchema.optional(),
		suggestedTimeZone: ianaTimeZoneSchema.optional(),
		type: z.literal('accommodation')
	}),
	z.strictObject({
		...importedItemBaseShape,
		type: z.literal('transport'),
		transport: z.strictObject({
			mode: transportModeSchema,
			operator: z.string().trim().min(1).optional(),
			serviceNumber: z.string().trim().min(1).optional(),
			schedule: transportJourneyScheduleSchema.optional()
		})
	})
]);

export const itineraryItemImportResponseSchema = z.strictObject({
	items: z.array(itineraryItemImportSchema).min(1)
});

export const apiErrorSchema = z.strictObject({
	message: z.string().min(1)
});

export type ItineraryItemImport = z.infer<typeof itineraryItemImportSchema>;
