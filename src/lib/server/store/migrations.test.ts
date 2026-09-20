import { describe, expect, it } from 'vitest';
import {
	preAvailabilityStoredDataVersion,
	preConstraintTimingStoredDataVersion,
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

	it('upgrades pre-constraint-timing user files while preserving the sudo account', () => {
		const migrated = migrateStoredUsersFile({
			users: [{ createdAt: 0, id: 'sudo-user', isSudo: true, passwordHash, username: 'sudo-user' }],
			version: preConstraintTimingStoredDataVersion
		});

		expect(migrated.migrationRequired).toBe(true);
		const file = storedUsersFileSchema.parse(migrated.file);
		expect(file.version).toBe(storedDataVersion);
		expect(file.users.map((user) => ({ id: user.id, isSudo: user.isSudo }))).toEqual([
			{ id: 'sudo-user', isSudo: true }
		]);
	});

	it('upgrades pre-day-placement planned items without inventing a day anchor', () => {
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

	it('migrates legacy deadlines to truthful one-sided timing while preserving their data', () => {
		const checkInAt = Date.UTC(2026, 10, 2, 6);
		const checkOutAt = Date.UTC(2026, 10, 4, 1);
		const cutoffAt = Date.UTC(2026, 10, 1, 4);
		const migrated = migrateStoredTripFile({
			trip: {
				createdAt: Date.UTC(2026, 3, 1),
				id: 'japan-2026',
				isPublic: false,
				itinerary: {
					items: [
						{
							availability: [
								{
									id: 'property-check-in',
									label: 'Property arrival',
									timing: { at: checkInAt, kind: 'deadline', timeZone: 'Asia/Tokyo' },
									type: 'check-in'
								},
								{
									id: 'property-check-out',
									timing: { at: checkOutAt, kind: 'deadline', timeZone: 'Asia/Tokyo' },
									type: 'check-out'
								},
								{
									id: 'ticket-cutoff',
									timing: { at: cutoffAt, kind: 'deadline', timeZone: 'Australia/Melbourne' },
									type: 'other'
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
				ownerId: null,
				revision: 0,
				updatedAt: Date.UTC(2026, 3, 1)
			},
			version: preConstraintTimingStoredDataVersion
		});

		expect(migrated.migrationRequired).toBe(true);
		const file = storedTripFileSchema.parse(migrated.file);
		expect(file.version).toBe(storedDataVersion);
		expect(file.trip.itinerary.items[0]?.availability).toEqual([
			{
				id: 'property-check-in',
				label: 'Property arrival',
				timing: { at: checkInAt, kind: 'from', timeZone: 'Asia/Tokyo' },
				type: 'check-in'
			},
			{
				id: 'property-check-out',
				timing: { at: checkOutAt, kind: 'until', timeZone: 'Asia/Tokyo' },
				type: 'check-out'
			},
			{
				id: 'ticket-cutoff',
				timing: { at: cutoffAt, kind: 'until', timeZone: 'Australia/Melbourne' },
				type: 'other'
			}
		]);
	});
});
