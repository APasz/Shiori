import { z } from 'zod';
import {
	calendarDateSchema,
	externalUrlSchema,
	googleMapsUrlSchema,
	itineraryIdentifierSchema,
	itineraryItemSchema,
	itineraryLinkSchema,
	locationRoleSchema,
	locationCoordinatesSchema,
	transportModeSchema,
	tripDetailsSchema,
	unixTimestampSchema
} from '$lib/itinerary/schema';

export const editLockResponseSchema = z.strictObject({
	expiresAt: unixTimestampSchema,
	revisionAtStart: z.number().int().nonnegative(),
	token: z.string().uuid()
});

export const editSaveRequestSchema = z.strictObject({
	item: itineraryItemSchema,
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

export const itemCreateRequestSchema = z.strictObject({
	item: itineraryItemSchema,
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

export const googleMapsLocationResolveRequestSchema = z.strictObject({
	url: googleMapsUrlSchema
});

export const googleMapsLocationResolveResponseSchema = z.strictObject({
	coordinates: locationCoordinatesSchema.optional(),
	googleMapsUrl: googleMapsUrlSchema,
	name: z.string().trim().min(1).optional()
});

export const itineraryItemImportRequestSchema = z.strictObject({
	url: externalUrlSchema
});

const importedLocationSchema = z.strictObject({
	coordinates: locationCoordinatesSchema.optional(),
	googleMapsUrl: googleMapsUrlSchema.optional(),
	name: z.string().trim().min(1),
	role: locationRoleSchema
});

const importedItemBaseShape = {
	links: z.array(itineraryLinkSchema).min(1),
	locations: z.array(importedLocationSchema),
	suggestedStartDate: calendarDateSchema.optional(),
	title: z.string().trim().min(1)
};

export const itineraryItemImportSchema = z.discriminatedUnion('type', [
	z.strictObject({ ...importedItemBaseShape, type: z.literal('activity') }),
	z.strictObject({ ...importedItemBaseShape, type: z.literal('accommodation') }),
	z.strictObject({
		...importedItemBaseShape,
		type: z.literal('transport'),
		transport: z.strictObject({
			mode: transportModeSchema,
			operator: z.string().trim().min(1).optional(),
			serviceNumber: z.string().trim().min(1).optional()
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
