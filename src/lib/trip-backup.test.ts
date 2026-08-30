import { describe, expect, it } from 'vitest';
import {
	createTripBackup,
	legacyTripBackupVersion,
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

	it('migrates a version-one daily note to a noon anchor', () => {
		const validation = validateTripBackup({
			exportedAt: Date.UTC(2026, 3, 1),
			format: tripBackupFormat,
			itinerary: {
				items: [],
				notes: [
					{
						date: '2026-04-13',
						kind: 'day',
						text: 'Keep this flexible.',
						timeZone: 'Asia/Tokyo'
					}
				],
				timeZone: 'Asia/Tokyo',
				title: 'Japan 2026'
			},
			version: legacyTripBackupVersion
		});

		if (!validation.valid) {
			throw new Error(validation.message);
		}
		expect(validation.backup).toMatchObject({
			itinerary: {
				notes: [
					{
						anchorAt: Date.UTC(2026, 3, 13, 3),
						id: 'day-note-2026-04-13',
						kind: 'day'
					}
				]
			},
			version: tripBackupVersion
		});
	});
});
