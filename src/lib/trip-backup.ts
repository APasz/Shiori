import { z } from 'zod';
import { itinerarySchema, unixTimestampSchema, type Itinerary } from '$lib/itinerary/schema';

export const tripBackupFormat = 'shiori-trip-backup';
export const tripBackupVersion = 1;
export const tripBackupFileExtension = 'shiori-bak';
export const tripBackupMediaType = 'application/vnd.shiori.trip-backup+json';
export const maximumTripBackupBytes = 20 * 1024 * 1024;
export const maximumTripBackupSizeLabel = '20 MB';

export const tripBackupSchema = z.strictObject({
	exportedAt: unixTimestampSchema,
	format: z.literal(tripBackupFormat),
	itinerary: itinerarySchema,
	version: z.literal(tripBackupVersion)
});

const tripBackupEnvelopeSchema = z.object({
	format: z.literal(tripBackupFormat),
	version: z.number().int()
});

export type TripBackup = z.infer<typeof tripBackupSchema>;

export type TripBackupValidation =
	{ readonly backup: TripBackup; readonly valid: true } | { readonly message: string; readonly valid: false };

/** Creates the complete, versioned itinerary snapshot stored in a Shiori trip backup. */
export function createTripBackup(itinerary: Itinerary, exportedAt: number): TripBackup {
	return tripBackupSchema.parse({
		exportedAt,
		format: tripBackupFormat,
		itinerary,
		version: tripBackupVersion
	});
}

/** Validates a backup and reports a user-facing incompatibility message when possible. */
export function validateTripBackup(value: unknown): TripBackupValidation {
	const envelope = tripBackupEnvelopeSchema.safeParse(value);
	if (!envelope.success) {
		return { message: 'Select a valid Shiori trip backup.', valid: false };
	}
	if (envelope.data.version > tripBackupVersion) {
		return { message: 'This trip backup was created by a newer version of Shiori.', valid: false };
	}
	if (envelope.data.version < tripBackupVersion) {
		return { message: 'This trip backup version is no longer supported.', valid: false };
	}

	const backup = tripBackupSchema.safeParse(value);
	return backup.success
		? { backup: backup.data, valid: true }
		: { message: 'This Shiori trip backup is incomplete or invalid.', valid: false };
}

/** Renders a backup as deterministic, human-inspectable JSON without giving it a generic JSON extension. */
export function serializeTripBackup(backup: TripBackup): string {
	return `${JSON.stringify(backup, null, 2)}\n`;
}

export function tripBackupFilename(title: string): string {
	const stem = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${stem || 'trip'}.${tripBackupFileExtension}`;
}
