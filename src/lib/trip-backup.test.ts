import { describe, expect, it } from 'vitest';
import {
	createTripBackup,
	serializeTripBackup,
	tripBackupFileExtension,
	tripBackupFormat,
	tripBackupVersion,
	validateTripBackup
} from './trip-backup';
import { itinerarySchema } from './itinerary/schema';

const itinerary = itinerarySchema.parse({
	expenses: [],
	items: [],
	localCurrency: 'AUD',
	notes: [],
	timeZone: 'Asia/Tokyo',
	title: 'Japan 2026'
});

describe('trip backups', () => {
	it('serializes the complete versioned itinerary in a distinct backup format', () => {
		const backup = createTripBackup(itinerary, Date.UTC(2026, 3, 1));

		expect(backup).toEqual({
			exportedAt: Date.UTC(2026, 3, 1),
			format: tripBackupFormat,
			itinerary,
			version: tripBackupVersion
		});
		expect(JSON.parse(serializeTripBackup(backup))).toEqual(backup);
		expect(tripBackupFileExtension).toBe('shiori-bak');
	});

	it('explains when a backup needs a newer Shiori version and rejects malformed contents', () => {
		expect(validateTripBackup({ format: tripBackupFormat, version: tripBackupVersion + 1 })).toEqual({
			message: 'This trip backup was created by a newer version of Shiori.',
			valid: false
		});
		expect(validateTripBackup({ format: tripBackupFormat, version: tripBackupVersion })).toEqual({
			message: 'This Shiori trip backup is incomplete or invalid.',
			valid: false
		});
	});
});
