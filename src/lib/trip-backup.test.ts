import { describe, expect, it } from 'vitest';
import {
	createTripBackup,
	legacyTripBackupVersion,
	preAvailabilityTripBackupVersion,
	preConstraintTimingTripBackupVersion,
	preDayPlacementTripBackupVersion,
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

	it('preserves current availability and defaults it for pre-availability backups', () => {
		const availability = [
			{
				id: 'museum-hours',
				timing: {
					endAt: Date.UTC(2026, 3, 12, 17),
					kind: 'period' as const,
					startAt: Date.UTC(2026, 3, 12, 9),
					timeZone: 'Asia/Tokyo'
				},
				type: 'opening-hours' as const
			}
		];
		const currentItinerary = itinerarySchema.parse({
			items: [
				{
					availability,
					id: 'museum',
					timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 12, 10) },
					title: 'Museum',
					type: 'activity'
				}
			],
			timeZone: 'Asia/Tokyo',
			title: 'Japan 2026'
		});
		expect(createTripBackup(currentItinerary, Date.UTC(2026, 3, 1)).itinerary.items[0]?.availability).toEqual(
			availability
		);

		const validation = validateTripBackup({
			exportedAt: Date.UTC(2026, 3, 1),
			format: tripBackupFormat,
			itinerary: {
				items: [
					{
						id: 'museum',
						timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 12, 10) },
						title: 'Museum',
						type: 'activity'
					}
				],
				timeZone: 'Asia/Tokyo',
				title: 'Japan 2026'
			},
			version: preAvailabilityTripBackupVersion
		});

		if (!validation.valid) {
			throw new Error(validation.message);
		}
		expect(validation.backup.itinerary.items[0]?.availability).toEqual([]);
		expect(validation.backup.version).toBe(tripBackupVersion);
	});

	it('preserves day-anchored availability-only items and upgrades pre-day-placement backups', () => {
		const placement = { anchorAt: Date.UTC(2026, 3, 12, 3), timeZone: 'Asia/Tokyo' };
		const availability = [
			{
				id: 'museum-hours',
				timing: {
					endAt: Date.UTC(2026, 3, 12, 7),
					kind: 'period' as const,
					startAt: Date.UTC(2026, 3, 12, 1),
					timeZone: 'Asia/Tokyo'
				},
				type: 'opening-hours' as const
			}
		];
		const currentItinerary = itinerarySchema.parse({
			items: [{ availability, id: 'museum', placement, title: 'Museum', type: 'activity' }],
			timeZone: 'Asia/Tokyo',
			title: 'Japan 2026'
		});

		const currentBackup = createTripBackup(currentItinerary, Date.UTC(2026, 3, 1));
		expect(currentBackup.itinerary.items[0]).toMatchObject({ availability, placement });
		expect(currentBackup.itinerary.items[0]).not.toHaveProperty('timing');

		const validation = validateTripBackup({
			exportedAt: Date.UTC(2026, 3, 1),
			format: tripBackupFormat,
			itinerary: {
				items: [
					{
						availability: [],
						id: 'museum',
						timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 12, 10) },
						title: 'Museum',
						type: 'activity'
					}
				],
				timeZone: 'Asia/Tokyo',
				title: 'Japan 2026'
			},
			version: preDayPlacementTripBackupVersion
		});

		if (!validation.valid) {
			throw new Error(validation.message);
		}
		expect(validation.backup.version).toBe(tripBackupVersion);
		expect(validation.backup.itinerary.items[0]?.timing).toEqual({
			kind: 'exact',
			startAt: Date.UTC(2026, 3, 12, 10)
		});
	});

	it('migrates version-four availability deadlines without changing their instants or zones', () => {
		const checkInAt = Date.UTC(2026, 10, 2, 6);
		const checkOutAt = Date.UTC(2026, 10, 4, 1);
		const validation = validateTripBackup({
			exportedAt: Date.UTC(2026, 3, 1),
			format: tripBackupFormat,
			itinerary: {
				items: [
					{
						availability: [
							{
								id: 'property-check-in',
								timing: { at: checkInAt, kind: 'deadline', timeZone: 'Asia/Tokyo' },
								type: 'check-in'
							},
							{
								id: 'property-check-out',
								timing: { at: checkOutAt, kind: 'deadline', timeZone: 'Asia/Tokyo' },
								type: 'check-out'
							}
						],
						id: 'hotel',
						timing: { kind: 'exact', startAt: checkInAt },
						title: 'Hotel',
						type: 'accommodation'
					}
				],
				timeZone: 'Asia/Tokyo',
				title: 'Japan 2026'
			},
			version: preConstraintTimingTripBackupVersion
		});

		if (!validation.valid) {
			throw new Error(validation.message);
		}
		expect(validation.backup.version).toBe(tripBackupVersion);
		expect(validation.backup.itinerary.items[0]?.availability).toEqual([
			{
				id: 'property-check-in',
				timing: { at: checkInAt, kind: 'from', timeZone: 'Asia/Tokyo' },
				type: 'check-in'
			},
			{
				id: 'property-check-out',
				timing: { at: checkOutAt, kind: 'until', timeZone: 'Asia/Tokyo' },
				type: 'check-out'
			}
		]);
	});
});
