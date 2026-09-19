import { describe, expect, it } from 'vitest';
import {
	preAvailabilityStoredDataVersion,
	preDayPlacementStoredDataVersion,
	storedDataVersion,
	storedTripFileSchema,
	storedUsersFileSchema
} from './model';
import { migrateStoredTripFile, migrateStoredUsersFile } from './migrations';

const passwordHash = `${'0'.repeat(32)}.${'0'.repeat(128)}`;

describe('stored trip migrations', () => {
	it('adds empty availability to pre-availability itinerary items', () => {
		const migrated = migrateStoredTripFile({
			trip: {
				createdAt: Date.UTC(2026, 3, 1),
				id: 'japan-2026',
				isPublic: false,
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
				ownerId: null,
				revision: 0,
				updatedAt: Date.UTC(2026, 3, 1)
			},
			version: preAvailabilityStoredDataVersion
		});

		expect(migrated.migrationRequired).toBe(true);
		const file = storedTripFileSchema.parse(migrated.file);
		expect(file.version).toBe(storedDataVersion);
		expect(file.trip.itinerary.items[0]?.availability).toEqual([]);
	});

	it('preserves the established sudo account while upgrading pre-availability users', () => {
		const migrated = migrateStoredUsersFile({
			users: [
				{ createdAt: 0, id: 'first-user', isSudo: false, passwordHash, username: 'first-user' },
				{ createdAt: 1, id: 'sudo-user', isSudo: true, passwordHash, username: 'sudo-user' }
			],
			version: preAvailabilityStoredDataVersion
		});

		expect(migrated.migrationRequired).toBe(true);
		const file = storedUsersFileSchema.parse(migrated.file);
		expect(file.version).toBe(storedDataVersion);
		expect(file.users.map((user) => ({ id: user.id, isSudo: user.isSudo }))).toEqual([
			{ id: 'first-user', isSudo: false },
			{ id: 'sudo-user', isSudo: true }
		]);
	});

	it('upgrades pre-day-placement scheduled items without inventing a day anchor', () => {
		const migrated = migrateStoredTripFile({
			trip: {
				createdAt: Date.UTC(2026, 3, 1),
				id: 'japan-2026',
				isPublic: false,
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
				ownerId: null,
				revision: 0,
				updatedAt: Date.UTC(2026, 3, 1)
			},
			version: preDayPlacementStoredDataVersion
		});

		expect(migrated.migrationRequired).toBe(true);
		const file = storedTripFileSchema.parse(migrated.file);
		expect(file.version).toBe(storedDataVersion);
		expect(file.trip.itinerary.items[0]).not.toHaveProperty('placement');
	});
});
