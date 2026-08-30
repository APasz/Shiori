import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyItineraryItem } from '../itinerary/draft';
import { itinerarySchema } from '../itinerary/schema';
import { defaultFormatPreferences } from '../format-preferences';
import { defaultColourway } from '../theme/colourway';
import { createTripBackup } from '../trip-backup';
import {
	preNoteAnchorStoredDataVersion,
	preSudoOwnedTripsStoredDataVersion,
	storedDataVersion,
	sudoPasswordResetPrefix
} from './store/model';

let dataDirectory = '';

const testPasswordHash = `${'0'.repeat(32)}.${'0'.repeat(128)}`;

type StoreModule = typeof import('./store');

type TestTrip = {
	id: string;
	revision: number;
	slug: string;
};

const costMigrationFixtures = [
	{
		sourceCost: {
			amount: { amountMinor: 12_500, currency: 'USD' },
			payment: {
				exchangeRate: 1.2,
				localAmount: { amountMinor: 15_000, currency: 'AUD' },
				paidAt: Date.UTC(2026, 3, 3),
				rateDate: '2026-04-03'
			},
			status: 'paid'
		},
		sourceVersion: 6
	},
	{
		sourceCost: {
			amount: 12_500,
			currency: 'USD',
			payment: {
				exchangeRate: 1.2,
				localAmount: 15_000,
				localCurrency: 'AUD',
				paidAt: Date.UTC(2026, 3, 3),
				rateDate: '2026-04-03'
			},
			status: 'paid'
		},
		sourceVersion: 7
	}
] as const satisfies readonly Readonly<{ sourceCost: Record<string, unknown>; sourceVersion: 6 | 7 }>[];

function managedTripPath(slug: string): string {
	return join(dataDirectory, 'trips', `${slug}.json`);
}

function managedDataPath(filename: string): string {
	return join(dataDirectory, filename);
}

async function createTestTrip(
	store: StoreModule,
	sudoUserId: string,
	itemIds: readonly string[] = []
): Promise<TestTrip> {
	const trip = await store.createTrip({
		actorId: sudoUserId,
		details: { title: 'Test trip', timeZone: 'UTC' }
	});
	let revision = 0;

	for (const itemId of itemIds) {
		const lock = await store.acquireTripStructureLock({ tripId: trip.id, userId: sudoUserId });
		const result = await store.createItem({
			item: {
				...createEmptyItineraryItem('activity', itemId, Date.UTC(2026, 0, 1)),
				title: itemId
			},
			lockToken: lock.token,
			revision,
			tripId: trip.id,
			userId: sudoUserId
		});
		revision = result.revision;
	}

	return { ...trip, revision };
}

beforeEach(async () => {
	dataDirectory = await mkdtemp(join(tmpdir(), 'shiori-store-test-'));
	process.env.SHIORI_DATA_DIRECTORY = dataDirectory;
	vi.resetModules();
});

afterEach(async () => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	delete process.env.SHIORI_DATA_DIRECTORY;
	await rm(dataDirectory, { force: true, recursive: true });
});

describe('JSON store', () => {
	it('starts a fresh store without a seeded trip', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');

		await expect(store.listTripSwitchOptions(owner.id)).resolves.toEqual([]);
	});

	it('restricts global administration and trip creation to the initial sudo account', async () => {
		const store = await import('./store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const person = await store.createAccount({
			actorId: sudo.id,
			password: 'another strong test password',
			username: 'person'
		});
		await expect(
			store.createTrip({ actorId: person.id, details: { title: 'Person trip', timeZone: 'UTC' } })
		).rejects.toMatchObject({ status: 403 });
		const trip = await store.createTrip({ actorId: sudo.id, details: { title: 'Sudo trip', timeZone: 'UTC' } });

		await expect(store.isSudoUser(sudo.id)).resolves.toBe(true);
		await expect(store.isSudoUser(person.id)).resolves.toBe(false);
		await expect(store.getTripView(trip.slug, sudo)).resolves.toMatchObject({ access: 'sudo' });
		await expect(store.getTripView(trip.slug, person)).resolves.toBeNull();
		await expect(store.listAccounts(person.id)).rejects.toMatchObject({ status: 403 });
		await expect(
			store.createAccount({ actorId: person.id, password: 'third strong test password', username: 'third-person' })
		).rejects.toMatchObject({ status: 403 });
		await expect(store.forceLogoutAllUsers(person.id)).rejects.toMatchObject({ status: 403 });

		const persistedUsers: { users: Array<{ isSudo: boolean; username: string }> } = JSON.parse(
			await readFile(managedDataPath('users.json'), 'utf8')
		);
		expect(persistedUsers.users).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ isSudo: true, username: 'sudo' }),
				expect.objectContaining({ isSudo: false, username: 'person' })
			])
		);
	});

	it('migrates version 13 data to a single sudo account', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		const store = await import('./store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
		const person = await store.createAccount({
			actorId: sudo.id,
			password: 'another strong test password',
			username: 'person'
		});
		const trip = await createTestTrip(store, sudo.id);

		const users: { users: Array<Record<string, unknown>>; version: number } = JSON.parse(
			await readFile(managedDataPath('users.json'), 'utf8')
		);
		users.version = 13;
		for (const user of users.users) {
			delete user.isSudo;
		}
		await writeFile(managedDataPath('users.json'), JSON.stringify(users, null, 4), 'utf8');
		for (const filename of ['shares.json', 'sessions.json', 'edit-locks.json']) {
			const globalData: { version: number } = JSON.parse(await readFile(managedDataPath(filename), 'utf8'));
			globalData.version = 13;
			await writeFile(managedDataPath(filename), JSON.stringify(globalData, null, 4), 'utf8');
		}
		const tripData: { version: number } = JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'));
		tripData.version = 13;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(tripData, null, 4), 'utf8');

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.isSudoUser(sudo.id)).resolves.toBe(true);
		await expect(restartedStore.isSudoUser(person.id)).resolves.toBe(false);
		expect(JSON.parse(await readFile(managedDataPath('users.json'), 'utf8'))).toMatchObject({
			version: storedDataVersion,
			users: [
				{ id: sudo.id, isSudo: true },
				{ id: person.id, isSudo: false }
			]
		});
	});

	it('migrates version 16 trips to sole sudo ownership', async () => {
		const store = await import('./store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const person = await store.createAccount({
			actorId: sudo.id,
			password: 'another strong test password',
			username: 'person'
		});
		const trip = await createTestTrip(store, sudo.id);
		const tripPath = managedTripPath(trip.slug);
		const persistedTrip: { trip: { ownerId: string | null }; version: number } = JSON.parse(
			await readFile(tripPath, 'utf8')
		);
		persistedTrip.trip.ownerId = person.id;
		persistedTrip.version = preSudoOwnedTripsStoredDataVersion;
		await writeFile(tripPath, JSON.stringify(persistedTrip, null, 4), 'utf8');

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.getTripView(trip.slug, sudo)).resolves.toMatchObject({ access: 'sudo' });
		await expect(restartedStore.getTripView(trip.slug, person)).resolves.toMatchObject({ access: 'admin' });
		expect(JSON.parse(await readFile(tripPath, 'utf8'))).toMatchObject({
			trip: { ownerId: sudo.id },
			version: storedDataVersion
		});
		expect(JSON.parse(await readFile(managedDataPath('shares.json'), 'utf8'))).toMatchObject({
			shares: [{ role: 'admin', tripId: trip.id, userId: person.id }]
		});
	});

	it('rejects current-format trips owned by a non-sudo account', async () => {
		const store = await import('./store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const person = await store.createAccount({
			actorId: sudo.id,
			password: 'another strong test password',
			username: 'person'
		});
		const trip = await createTestTrip(store, sudo.id);
		const tripPath = managedTripPath(trip.slug);
		const persistedTrip: { trip: { ownerId: string | null } } = JSON.parse(await readFile(tripPath, 'utf8'));
		persistedTrip.trip.ownerId = person.id;
		await writeFile(tripPath, JSON.stringify(persistedTrip, null, 4), 'utf8');

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.needsInitialSetup()).rejects.toThrow('Every trip must be owned by the sole sudo user.');
	});

	it('breaks legacy sudo-migration timestamp ties by account ID', async () => {
		const { migrateStoredUsersFile } = await import('./store/migrations');

		const migrated = migrateStoredUsersFile({
			version: 13,
			users: [
				{ createdAt: 0, id: 'z-user', passwordHash: testPasswordHash, username: 'zuser' },
				{ createdAt: 0, id: 'a-user', passwordHash: testPasswordHash, username: 'auser' }
			]
		});

		expect(migrated).toEqual({
			file: {
				version: storedDataVersion,
				users: [
					{
						colourway: defaultColourway,
						createdAt: 0,
						formatPreferences: defaultFormatPreferences,
						id: 'z-user',
						isSudo: false,
						passwordHash: testPasswordHash,
						username: 'zuser'
					},
					{
						colourway: defaultColourway,
						createdAt: 0,
						formatPreferences: defaultFormatPreferences,
						id: 'a-user',
						isSudo: true,
						passwordHash: testPasswordHash,
						username: 'auser'
					}
				]
			},
			migrationRequired: true
		});
	});

	it('adds the default colourway to version 14 accounts without changing their sudo user', async () => {
		const { migrateStoredUsersFile } = await import('./store/migrations');

		const migrated = migrateStoredUsersFile({
			version: 14,
			users: [
				{ createdAt: 0, id: 'z-user', isSudo: false, passwordHash: testPasswordHash, username: 'zuser' },
				{ createdAt: 1, id: 'a-user', isSudo: true, passwordHash: testPasswordHash, username: 'auser' }
			]
		});

		expect(migrated).toMatchObject({
			file: {
				version: storedDataVersion,
				users: [
					{
						colourway: defaultColourway,
						formatPreferences: defaultFormatPreferences,
						id: 'z-user',
						isSudo: false
					},
					{
						colourway: defaultColourway,
						formatPreferences: defaultFormatPreferences,
						id: 'a-user',
						isSudo: true
					}
				]
			},
			migrationRequired: true
		});
	});

	it('adds default display formats to version 15 accounts without changing their other preferences', async () => {
		const { migrateStoredUsersFile } = await import('./store/migrations');

		const migrated = migrateStoredUsersFile({
			version: 15,
			users: [
				{
					colourway: 'violet',
					createdAt: 0,
					id: 'sudo-user',
					isSudo: true,
					passwordHash: testPasswordHash,
					username: 'sudo'
				}
			]
		});

		expect(migrated).toMatchObject({
			file: {
				version: storedDataVersion,
				users: [
					{
						colourway: 'violet',
						formatPreferences: defaultFormatPreferences,
						id: 'sudo-user',
						isSudo: true
					}
				]
			},
			migrationRequired: true
		});
	});

	it('restores a backup as a new private trip without changing itinerary data', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const sourceItinerary = itinerarySchema.parse({
			expenses: [
				{
					amountMinor: 12_500,
					availableForItemCosts: true,
					category: 'transport',
					currency: 'USD',
					id: 'rail-pass',
					paidDate: '2026-04-03',
					status: 'paid',
					title: 'Rail pass',
					useDate: '2026-04-12'
				}
			],
			items: [
				{
					id: 'train-to-kyoto',
					linkedExpenseIds: ['rail-pass'],
					locations: [
						{ id: 'tokyo', name: 'Tokyo Station', role: 'departure' },
						{ id: 'kyoto', name: 'Kyoto Station', role: 'arrival' }
					],
					notes: ['Bring the rail pass.'],
					timing: { kind: 'exact', startAt: Date.UTC(2026, 3, 12, 0, 0) },
					title: 'Shinkansen to Kyoto',
					transport: {
						mode: 'rail',
						stops: [{ locationId: 'tokyo', platform: '20' }, { locationId: 'kyoto' }]
					},
					type: 'transport'
				}
			],
			localCurrency: 'AUD',
			notes: [
				{
					entries: [
						{
							estimatedCosts: [{ amountMinor: 3_500, currency: 'JPY', id: 'museum-entry-cost' }],
							id: 'museum-entry',
							links: [],
							state: 'shortlisted',
							title: 'Museum option'
						}
					],
					kind: 'trip',
					text: 'Keep the second afternoon flexible.',
					timeZone: 'Asia/Tokyo'
				}
			],
			timeZone: 'Asia/Tokyo',
			title: 'Japan 2026'
		});

		const imported = await store.importTripBackup({
			actorId: owner.id,
			backup: createTripBackup(sourceItinerary, Date.UTC(2026, 3, 1))
		});
		const restored = await store.getTripView(imported.slug, owner);
		const reexported = await store.exportTripBackup({ tripId: imported.id, userId: owner.id });
		const sharedUser = await store.createAccount({
			actorId: owner.id,
			password: 'a second strong test password',
			username: 'shared-user'
		});

		expect(restored).toMatchObject({
			access: 'sudo',
			canEdit: true,
			isPublic: false,
			revision: 0,
			itinerary: sourceItinerary
		});
		expect(reexported.itinerary).toEqual(sourceItinerary);
		await expect(store.exportTripBackup({ tripId: imported.id, userId: sharedUser.id })).rejects.toMatchObject({
			status: 403
		});
		await expect(
			store.importTripBackup({
				actorId: sharedUser.id,
				backup: createTripBackup(sourceItinerary, Date.UTC(2026, 3, 1))
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('persists global domains and trips as separate four-space JSON files', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		await createTestTrip(store, owner.id);

		const [users, shares, sessions, editLocks, trip] = await Promise.all([
			readFile(managedDataPath('users.json'), 'utf8'),
			readFile(managedDataPath('shares.json'), 'utf8'),
			readFile(managedDataPath('sessions.json'), 'utf8'),
			readFile(managedDataPath('edit-locks.json'), 'utf8'),
			readFile(managedTripPath('test-trip'), 'utf8')
		]);

		for (const source of [users, shares, sessions, editLocks, trip]) {
			expect(source).toContain(`\n    "version": ${storedDataVersion}`);
			expect(source).toMatch(/\n$/);
		}
		expect(JSON.parse(users)).toMatchObject({ version: storedDataVersion, users: [{ username: 'owner' }] });
		expect(JSON.parse(trip)).toMatchObject({ version: storedDataVersion, trip: { id: expect.any(String) } });
		expect(JSON.parse(trip)).not.toHaveProperty('trip.slug');
	});

	it('writes backups only for the data changed by a transaction', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const firstTrip = await createTestTrip(store, owner.id);
		const secondTrip = await store.createTrip({
			actorId: owner.id,
			details: { title: 'Second trip', timeZone: 'UTC' }
		});
		const untouchedBackupPaths = [
			...['users.json', 'shares.json', 'sessions.json', 'edit-locks.json'].map(
				(filename) => `${managedDataPath(filename)}.backup`
			),
			`${managedTripPath(firstTrip.slug)}.backup`
		];
		await Promise.all(untouchedBackupPaths.map((filePath) => rm(filePath, { force: true })));

		await store.setTripPublic({ actorId: owner.id, isPublic: true, tripId: secondTrip.id });

		await expect(readFile(`${managedTripPath(secondTrip.slug)}.backup`, 'utf8')).resolves.toContain(
			'"isPublic": false'
		);
		for (const filePath of untouchedBackupPaths) {
			await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
		}
	});

	it('uses the trip filename as its slug', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		await rename(managedTripPath(trip.slug), managedTripPath('renamed-trip'));

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.getTripView('renamed-trip', owner)).resolves.toMatchObject({
			slug: 'renamed-trip'
		});
	});

	it('consumes a server sudo password reset marker without retaining its password in a backup', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'original strong server password');
		await store.createAccount({
			actorId: owner.id,
			password: 'another strong test password',
			username: 'person'
		});
		const sessionId = await store.createSession(owner.id);
		const usersPath = managedDataPath('users.json');
		const preservedBackup = await readFile(`${usersPath}.backup`, 'utf8');
		const replacementPassword = 'replacement strong server password';
		const persistedUsers: { users: Array<{ id: string; isSudo: boolean; passwordHash: string }> } = JSON.parse(
			await readFile(usersPath, 'utf8')
		);
		const sudoUser = persistedUsers.users.find((user) => user.id === owner.id);
		if (!sudoUser) {
			throw new Error('The test sudo account should be persisted.');
		}
		sudoUser.passwordHash = `${sudoPasswordResetPrefix}${replacementPassword}`;
		await writeFile(usersPath, JSON.stringify(persistedUsers, null, 4), 'utf8');

		vi.resetModules();
		const { initializeStore } = await import('./store/persistence');
		await initializeStore();
		const rewrittenUsers = await readFile(usersPath, 'utf8');
		const rewrittenBackup = await readFile(`${usersPath}.backup`, 'utf8');
		expect(rewrittenUsers).not.toContain(replacementPassword);
		expect(rewrittenBackup).toBe(preservedBackup);
		expect(rewrittenBackup).not.toContain(replacementPassword);
		expect(JSON.parse(rewrittenUsers)).toMatchObject({
			users: expect.arrayContaining([
				expect.objectContaining({
					id: owner.id,
					passwordHash: expect.stringMatching(/^[0-9a-f]{32}\.[0-9a-f]{128}$/)
				})
			])
		});

		const restartedStore = await import('./store');
		await expect(restartedStore.authenticate(owner.username, 'original strong server password')).resolves.toBeNull();
		await expect(restartedStore.authenticate(owner.username, replacementPassword)).resolves.toEqual(owner);
		await expect(restartedStore.refreshSession(sessionId)).resolves.toBeNull();
	});

	it('rejects a server sudo password reset marker for a non-sudo account', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const person = await store.createAccount({
			actorId: owner.id,
			password: 'another strong test password',
			username: 'person'
		});
		const usersPath = managedDataPath('users.json');
		const persistedUsers: { users: Array<{ id: string; passwordHash: string }> } = JSON.parse(
			await readFile(usersPath, 'utf8')
		);
		const managedUser = persistedUsers.users.find((user) => user.id === person.id);
		if (!managedUser) {
			throw new Error('The test managed account should be persisted.');
		}
		managedUser.passwordHash = `${sudoPasswordResetPrefix}replacement strong password`;
		await writeFile(usersPath, JSON.stringify(persistedUsers, null, 4), 'utf8');

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.needsInitialSetup()).rejects.toThrow(
			'The reset: password marker may only be used for the single sudo account.'
		);
	});

	it('requires an explicit marker for server sudo password recovery', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const usersPath = managedDataPath('users.json');
		const persistedUsers: { users: Array<{ id: string; passwordHash: string }> } = JSON.parse(
			await readFile(usersPath, 'utf8')
		);
		const sudoUser = persistedUsers.users.find((user) => user.id === owner.id);
		if (!sudoUser) {
			throw new Error('The test sudo account should be persisted.');
		}
		sudoUser.passwordHash = 'replacement strong password';
		await writeFile(usersPath, JSON.stringify(persistedUsers, null, 4), 'utf8');

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.needsInitialSetup()).rejects.toThrow(
			'Use a valid password hash or an explicit sudo password reset marker.'
		);
	});

	it('uses cached validated data until the server process restarts', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const persistedTrip: { trip: { itinerary: { title: string } } } = JSON.parse(
			await readFile(managedTripPath(trip.slug), 'utf8')
		);
		persistedTrip.trip.itinerary.title = 'Changed directly on disk';
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		await expect(store.getTripView(trip.slug, owner)).resolves.toMatchObject({
			itinerary: { title: 'Test trip' }
		});

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(restartedStore.getTripView(trip.slug, owner)).resolves.toMatchObject({
			itinerary: { title: 'Changed directly on disk' }
		});
	});

	it('migrates pre-notes trips to an empty notes list', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const persistedTrip: { trip: { itinerary: Record<string, unknown> }; version: number } = JSON.parse(
			await readFile(managedTripPath(trip.slug), 'utf8')
		);
		delete persistedTrip.trip.itinerary.notes;
		persistedTrip.version = 11;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		for (const filePath of [
			managedDataPath('users.json'),
			managedDataPath('shares.json'),
			managedDataPath('sessions.json'),
			managedDataPath('edit-locks.json')
		]) {
			const persistedGlobalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
			persistedGlobalData.version = 11;
			await writeFile(filePath, JSON.stringify(persistedGlobalData, null, 4), 'utf8');
		}

		vi.resetModules();
		const restartedStore = await import('./store');
		const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
		if (!migratedTrip || migratedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the migrated trip.');
		}
		expect(migratedTrip.itinerary.notes).toEqual([]);
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({
			trip: { itinerary: { notes: [] } },
			version: storedDataVersion
		});
	});

	it('migrates legacy daily note dates to noon anchors in their entry-time zone', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const persistedTrip: { trip: { itinerary: { notes: unknown[] } }; version: number } = JSON.parse(
			await readFile(managedTripPath(trip.slug), 'utf8')
		);
		persistedTrip.trip.itinerary.notes = [
			{
				date: '2026-04-13',
				kind: 'day',
				text: 'Keep the afternoon flexible.',
				timeZone: 'Asia/Tokyo'
			}
		];
		persistedTrip.version = preNoteAnchorStoredDataVersion;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		for (const filePath of [
			managedDataPath('users.json'),
			managedDataPath('shares.json'),
			managedDataPath('sessions.json'),
			managedDataPath('edit-locks.json')
		]) {
			const persistedGlobalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
			persistedGlobalData.version = preNoteAnchorStoredDataVersion;
			await writeFile(filePath, JSON.stringify(persistedGlobalData, null, 4), 'utf8');
		}

		vi.resetModules();
		const restartedStore = await import('./store');
		const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
		if (!migratedTrip || migratedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the migrated trip.');
		}
		expect(migratedTrip.itinerary.notes).toEqual([
			{
				anchorAt: Date.UTC(2026, 3, 13, 3),
				entries: [],
				id: 'day-note-2026-04-13',
				kind: 'day',
				text: 'Keep the afternoon flexible.',
				timeZone: 'Asia/Tokyo'
			}
		]);
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({
			trip: {
				itinerary: {
					notes: [{ anchorAt: Date.UTC(2026, 3, 13, 3), id: 'day-note-2026-04-13' }]
				}
			},
			version: storedDataVersion
		});
	});

	it.each(costMigrationFixtures)(
		'migrates version $sourceVersion cost records to explicit minor-unit fields on startup',
		async ({ sourceCost, sourceVersion }) => {
			const store = await import('./store');
			const owner = await store.createInitialSudo('owner', 'a strong test password');
			const trip = await createTestTrip(store, owner.id, ['legacy-cost']);
			const persistedTrip: {
				version: number;
				trip: { itinerary: { items: Array<Record<string, unknown>> } };
			} = JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'));
			const legacyItem = persistedTrip.trip.itinerary.items.find((item) => item.id === 'legacy-cost');
			if (!legacyItem) {
				throw new Error('The test trip should contain the legacy cost item.');
			}
			legacyItem.cost = sourceCost;
			persistedTrip.version = sourceVersion;
			await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

			for (const filePath of [
				managedDataPath('users.json'),
				managedDataPath('shares.json'),
				managedDataPath('sessions.json'),
				managedDataPath('edit-locks.json')
			]) {
				const persistedGlobalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
				persistedGlobalData.version = sourceVersion;
				await writeFile(filePath, JSON.stringify(persistedGlobalData, null, 4), 'utf8');
			}

			vi.resetModules();
			const restartedStore = await import('./store');
			const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
			if (!migratedTrip || migratedTrip.access !== 'sudo') {
				throw new Error('The owner should be able to read the migrated trip.');
			}
			expect(migratedTrip.itinerary.items.find((item) => item.id === 'legacy-cost')?.cost).toEqual({
				amountMinor: 12_500,
				currency: 'USD',
				payment: {
					exchangeRate: 1.2,
					localAmountMinor: 15_000,
					localCurrency: 'AUD',
					paidAt: Date.UTC(2026, 3, 3),
					rateDate: '2026-04-03'
				},
				status: 'paid'
			});

			const migratedFiles = await Promise.all(
				[
					managedDataPath('users.json'),
					managedDataPath('shares.json'),
					managedDataPath('sessions.json'),
					managedDataPath('edit-locks.json'),
					managedTripPath(trip.slug)
				].map(async (filePath) => JSON.parse(await readFile(filePath, 'utf8')) as { version: number })
			);
			expect(migratedFiles.map((file) => file.version)).toEqual(Array.from({ length: 5 }, () => storedDataVersion));
		}
	);

	it('migrates version 8 trips by adding an empty expense inventory', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const persistedTrip: { version: number; trip: { itinerary: Record<string, unknown> } } = JSON.parse(
			await readFile(managedTripPath(trip.slug), 'utf8')
		);
		delete persistedTrip.trip.itinerary.expenses;
		persistedTrip.version = 8;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		for (const filePath of [
			managedDataPath('users.json'),
			managedDataPath('shares.json'),
			managedDataPath('sessions.json'),
			managedDataPath('edit-locks.json')
		]) {
			const globalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
			globalData.version = 8;
			await writeFile(filePath, JSON.stringify(globalData, null, 4), 'utf8');
		}

		vi.resetModules();
		const restartedStore = await import('./store');
		const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
		if (!migratedTrip || migratedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the migrated trip.');
		}
		expect(migratedTrip.itinerary.expenses).toEqual([]);
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({
			version: storedDataVersion
		});
	});

	it('migrates version 9 daily spending into paid expenses', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const persistedTrip: { version: number; trip: { itinerary: Record<string, unknown> } } = JSON.parse(
			await readFile(managedTripPath(trip.slug), 'utf8')
		);
		delete persistedTrip.trip.itinerary.expenses;
		delete persistedTrip.trip.itinerary.localCurrency;
		persistedTrip.trip.itinerary.dailyExpenses = [{ date: '2026-01-01', foodAmountMinor: 2_500, miscAmountMinor: 350 }];
		persistedTrip.version = 9;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		for (const filePath of [
			managedDataPath('users.json'),
			managedDataPath('shares.json'),
			managedDataPath('sessions.json'),
			managedDataPath('edit-locks.json')
		]) {
			const globalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
			globalData.version = 9;
			await writeFile(filePath, JSON.stringify(globalData, null, 4), 'utf8');
		}

		vi.resetModules();
		const restartedStore = await import('./store');
		const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
		if (!migratedTrip || migratedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the migrated trip.');
		}
		expect(migratedTrip.itinerary.expenses).toEqual([
			{
				amountMinor: 2_500,
				availableForItemCosts: false,
				category: 'food',
				currency: 'AUD',
				id: 'food-2026-01-01',
				paidDate: '2026-01-01',
				status: 'paid',
				title: 'Food',
				useDate: '2026-01-01'
			},
			{
				amountMinor: 350,
				availableForItemCosts: false,
				category: 'misc',
				currency: 'AUD',
				id: 'misc-2026-01-01',
				paidDate: '2026-01-01',
				status: 'paid',
				title: 'Miscellaneous',
				useDate: '2026-01-01'
			}
		]);
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({
			version: storedDataVersion
		});
	});

	it('migrates version 10 expenses and items with default expense links', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id, ['legacy-item']);
		const persistedTrip: { version: number; trip: { itinerary: Record<string, unknown> } } = JSON.parse(
			await readFile(managedTripPath(trip.slug), 'utf8')
		);
		persistedTrip.trip.itinerary.expenses = [
			{
				amountMinor: 45_000,
				category: 'transport',
				currency: 'AUD',
				id: 'rail-pass',
				status: 'unpaid',
				title: 'Rail pass'
			}
		];
		persistedTrip.version = 10;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		for (const filePath of [
			managedDataPath('users.json'),
			managedDataPath('shares.json'),
			managedDataPath('sessions.json'),
			managedDataPath('edit-locks.json')
		]) {
			const globalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
			globalData.version = 10;
			await writeFile(filePath, JSON.stringify(globalData, null, 4), 'utf8');
		}

		vi.resetModules();
		const restartedStore = await import('./store');
		const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
		if (!migratedTrip || migratedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the migrated trip.');
		}
		expect(migratedTrip.itinerary.expenses[0]?.availableForItemCosts).toBe(false);
		expect(migratedTrip.itinerary.items.find((item) => item.id === 'legacy-item')?.linkedExpenseIds).toEqual([]);
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({
			version: storedDataVersion
		});
	});

	it('rejects incomplete or invalid split data before serving it', async () => {
		await writeFile(managedDataPath('users.json'), JSON.stringify({ version: 6, users: [] }, null, 4), 'utf8');

		const incompleteStore = await import('./store');
		await expect(incompleteStore.needsInitialSetup()).rejects.toThrow('Split Shiori data is incomplete.');

		vi.resetModules();
		await Promise.all([
			writeFile(
				managedDataPath('shares.json'),
				JSON.stringify(
					{
						version: 6,
						shares: [{ tripId: 'missing-trip', userId: 'owner', role: 'admin' }]
					},
					null,
					4
				),
				'utf8'
			),
			writeFile(
				managedDataPath('users.json'),
				JSON.stringify(
					{
						version: 6,
						users: [
							{
								id: 'owner',
								username: 'owner',
								passwordHash: testPasswordHash,
								createdAt: 1_767_225_600_000
							}
						]
					},
					null,
					4
				),
				'utf8'
			),
			writeFile(managedDataPath('sessions.json'), JSON.stringify({ version: 6, sessions: [] }, null, 4), 'utf8'),
			writeFile(managedDataPath('edit-locks.json'), JSON.stringify({ version: 6, editLocks: [] }, null, 4), 'utf8')
		]);

		const invalidStore = await import('./store');
		await expect(invalidStore.needsInitialSetup()).rejects.toThrow('A share must reference an existing trip.');
	});

	it('prunes expired records during every write transaction', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, user.id);
		await store.createSession(user.id);

		vi.setSystemTime(new Date('2026-01-09T00:00:00.000Z'));
		await store.setTripPublic({ actorId: user.id, isPublic: true, tripId: trip.id });

		const persisted: unknown = JSON.parse(await readFile(managedDataPath('sessions.json'), 'utf8'));
		expect(persisted).toMatchObject({ sessions: [] });
	});

	it('renews an active session every nine hours', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const sessionId = await store.createSession(user.id);
		const beforeRefresh = await readFile(managedDataPath('sessions.json'), 'utf8');

		vi.setSystemTime(new Date('2026-01-01T08:59:00.000Z'));
		await expect(store.refreshSession(sessionId)).resolves.toEqual({
			renewed: false,
			user: { ...user, colourway: defaultColourway, formatPreferences: defaultFormatPreferences }
		});
		expect(await readFile(managedDataPath('sessions.json'), 'utf8')).toBe(beforeRefresh);

		vi.setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
		await expect(store.refreshSession(sessionId)).resolves.toEqual({
			renewed: true,
			user: { ...user, colourway: defaultColourway, formatPreferences: defaultFormatPreferences }
		});

		const persisted: { sessions: Array<{ expiresAt: number; id: string }> } = JSON.parse(
			await readFile(managedDataPath('sessions.json'), 'utf8')
		);
		expect(persisted.sessions.find((session) => session.id === sessionId)).toMatchObject({
			expiresAt: Date.UTC(2026, 0, 8, 9),
			id: sessionId
		});
	});

	it('lists signed-in users by their most recent session renewal', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		await createTestTrip(store, owner.id);
		const member = await store.createAccount({
			actorId: owner.id,
			password: 'another strong password',
			username: 'member'
		});
		await store.createSession(owner.id);

		vi.setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
		await store.createSession(member.id);

		await expect(store.listActiveSessionUsers(owner.id)).resolves.toEqual([
			{ id: member.id, lastSeenAt: Date.UTC(2026, 0, 1, 1), username: 'member' },
			{ id: owner.id, lastSeenAt: Date.UTC(2026, 0, 1), username: 'owner' }
		]);
		await expect(store.listActiveSessionUsers(member.id)).rejects.toMatchObject({ status: 403 });

		vi.setSystemTime(new Date('2026-01-09T00:00:00.000Z'));
		await expect(store.listActiveSessionUsers(owner.id)).resolves.toEqual([]);
	});

	it('lets a sudo owner force logout every signed-in user', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		await createTestTrip(store, owner.id);
		const member = await store.createAccount({
			actorId: owner.id,
			password: 'another strong password',
			username: 'member'
		});
		await store.createSession(owner.id);
		await store.createSession(owner.id);
		await store.createSession(member.id);

		await expect(store.forceLogoutAllUsers(member.id)).rejects.toMatchObject({ status: 403 });
		await expect(store.forceLogoutAllUsers(owner.id)).resolves.toEqual({ loggedOut: 2 });
		await expect(store.listActiveSessionUsers(owner.id)).resolves.toEqual([]);
	});

	it('creates a private empty trip and updates its basic details', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');

		const created = await store.createTrip({
			actorId: owner.id,
			details: { title: 'Summer in Montréal', timeZone: 'America/Toronto' }
		});

		expect(created.slug).toBe('summer-in-montreal');
		const trip = await store.getTripView(created.slug, owner);
		if (!trip || trip.access !== 'sudo') {
			throw new Error('The creator should be the new trip owner.');
		}
		expect(trip).toMatchObject({
			canEdit: true,
			isPublic: false,
			itinerary: {
				items: [],
				timeZone: 'America/Toronto',
				title: 'Summer in Montréal'
			}
		});

		const saved = await store.saveTripDetails({
			details: { title: 'Autumn in Montréal', timeZone: 'America/Toronto' },
			revision: trip.revision,
			tripId: trip.id,
			userId: owner.id
		});
		expect(saved).toEqual({ revision: 1 });

		const updated = await store.getTripView(created.slug, owner);
		expect(updated?.itinerary.title).toBe('Autumn in Montréal');
	});

	it('deletes a sudo-owned trip and its shared access', async () => {
		const store = await import('./store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const person = await store.createAccount({
			actorId: sudo.id,
			password: 'another strong test password',
			username: 'person'
		});
		const trip = await createTestTrip(store, sudo.id);
		await store.setTripMemberAccess({ actorId: sudo.id, role: 'user', tripId: trip.id, userId: person.id });

		await expect(
			store.deleteTrip({ revision: trip.revision, tripId: trip.id, userId: person.id })
		).rejects.toMatchObject({ status: 403 });
		await expect(
			store.deleteTrip({ revision: trip.revision + 1, tripId: trip.id, userId: sudo.id })
		).rejects.toMatchObject({ status: 409 });

		const lock = await store.acquireTripStructureLock({ tripId: trip.id, userId: sudo.id });
		await expect(store.deleteTrip({ revision: trip.revision, tripId: trip.id, userId: sudo.id })).rejects.toMatchObject(
			{ status: 423 }
		);
		await store.releaseTripStructureLock({ lockToken: lock.token, tripId: trip.id, userId: sudo.id });

		await expect(
			store.deleteTrip({ revision: trip.revision, tripId: trip.id, userId: sudo.id })
		).resolves.toBeUndefined();
		await expect(store.getTripView(trip.slug, sudo)).resolves.toBeNull();
		await expect(store.getTripView(trip.slug, person)).resolves.toBeNull();
		await expect(store.listTripSwitchOptions(sudo.id)).resolves.toEqual([]);
		await expect(store.listTripSwitchOptions(person.id)).resolves.toEqual([]);
		await expect(readFile(managedTripPath(trip.slug), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
		expect(JSON.parse(await readFile(managedDataPath('shares.json'), 'utf8'))).toMatchObject({ shares: [] });
	});

	it('creates, updates, and deletes free-form expenses', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const expense = {
			amountMinor: 45_000,
			availableForItemCosts: true,
			category: 'transport' as const,
			currency: 'AUD' as const,
			id: 'rail-pass',
			note: 'Regional rail pass',
			status: 'unpaid' as const,
			title: 'Rail pass',
			useDate: '2026-01-02'
		};

		await expect(
			store.createExpense({
				expense,
				revision: trip.revision,
				tripId: trip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: trip.revision + 1 });

		const savedTrip = await store.getTripView(trip.slug, owner);
		if (!savedTrip || savedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read saved expenses.');
		}
		expect(savedTrip.itinerary.expenses).toEqual([expense]);
		const paidExpense = { ...expense, paidDate: '2026-01-01', status: 'paid' as const };

		await expect(
			store.saveExpense({
				expense: paidExpense,
				revision: savedTrip.revision,
				tripId: trip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: savedTrip.revision + 1 });
		const updatedTrip = await store.getTripView(trip.slug, owner);
		if (!updatedTrip || updatedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read updated expenses.');
		}
		expect(updatedTrip.itinerary.expenses).toEqual([paidExpense]);

		await expect(
			store.deleteExpense({
				expenseId: expense.id,
				revision: updatedTrip.revision,
				tripId: trip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: updatedTrip.revision + 1 });
		const deletedTrip = await store.getTripView(trip.slug, owner);
		if (!deletedTrip || deletedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read deleted expenses.');
		}
		expect(deletedTrip.itinerary.expenses).toEqual([]);
	});

	it('saves, replaces, and deletes separate planning notes', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const dayNote = {
			anchorAt: Date.UTC(2026, 0, 2, 3),
			entries: [
				{
					estimatedCosts: [{ amountMinor: 1_500, currency: 'JPY' as const, id: 'tea-cost', label: 'Tea' }],
					id: 'tea-entry',
					links: [],
					note: 'Keep this as an alternate plan.',
					startTime: '15:00',
					state: 'shortlisted' as const,
					title: 'Tea ceremony'
				}
			],
			id: 'day-note-2026-01-02',
			kind: 'day' as const,
			text: 'Ideas for the afternoon.',
			timeZone: 'Asia/Tokyo'
		};

		await expect(
			store.saveNote({ note: dayNote, revision: trip.revision, tripId: trip.id, userId: owner.id })
		).resolves.toEqual({ revision: trip.revision + 1 });
		const savedTrip = await store.getTripView(trip.slug, owner);
		if (!savedTrip || savedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read saved notes.');
		}
		expect(savedTrip.itinerary.notes).toEqual([dayNote]);

		const replacementNote = {
			...dayNote,
			anchorAt: Date.UTC(2026, 0, 3, 3),
			text: 'A shorter afternoon plan.'
		};
		await expect(
			store.saveNote({
				note: replacementNote,
				revision: savedTrip.revision,
				tripId: savedTrip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: savedTrip.revision + 1 });
		const replacedTrip = await store.getTripView(trip.slug, owner);
		if (!replacedTrip || replacedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read replaced notes.');
		}
		expect(replacedTrip.itinerary.notes).toEqual([replacementNote]);

		await expect(
			store.deleteNote({
				revision: replacedTrip.revision,
				target: { id: dayNote.id, kind: 'day' },
				tripId: replacedTrip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: replacedTrip.revision + 1 });
		const deletedTrip = await store.getTripView(trip.slug, owner);
		if (!deletedTrip || deletedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read deleted notes.');
		}
		expect(deletedTrip.itinerary.notes).toEqual([]);

		await expect(
			store.saveNote({
				note: { entries: [], kind: 'trip', text: '   ', timeZone: 'UTC' },
				revision: deletedTrip.revision,
				tripId: deletedTrip.id,
				userId: owner.id
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('links selectable expenses alongside an item’s direct cost', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const railPass = {
			amountMinor: 45_000,
			availableForItemCosts: true,
			category: 'transport' as const,
			currency: 'AUD' as const,
			id: 'jr-pass',
			status: 'paid' as const,
			paidDate: '2026-01-01',
			title: 'JR Rail Pass'
		};
		await store.createExpense({ expense: railPass, revision: trip.revision, tripId: trip.id, userId: owner.id });

		const itemLock = await store.acquireTripStructureLock({ tripId: trip.id, userId: owner.id });
		const nozomi = {
			...createEmptyItineraryItem('transport', 'nozomi', Date.UTC(2026, 0, 2)),
			cost: { amountMinor: 8_000, currency: 'JPY' as const, status: 'unpaid' as const },
			linkedExpenseIds: [railPass.id],
			locations: [
				{ id: 'tokyo', name: 'Tokyo', role: 'departure' as const },
				{ id: 'kyoto', name: 'Kyoto', role: 'arrival' as const }
			],
			title: 'Nozomi supplementary ticket',
			transport: {
				mode: 'rail' as const,
				stops: [{ locationId: 'tokyo' }, { locationId: 'kyoto' }]
			}
		};
		await expect(
			store.createItem({
				item: { ...nozomi, linkedExpenseIds: [railPass.id, railPass.id] },
				lockToken: itemLock.token,
				revision: trip.revision + 1,
				tripId: trip.id,
				userId: owner.id
			})
		).rejects.toMatchObject({ status: 400 });
		await expect(
			store.createItem({
				item: nozomi,
				lockToken: itemLock.token,
				revision: trip.revision + 1,
				tripId: trip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: trip.revision + 2 });

		const linkedTrip = await store.getTripView(trip.slug, owner);
		if (!linkedTrip || linkedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the linked expense.');
		}
		const linkedNozomi = linkedTrip.itinerary.items.find((item) => item.id === nozomi.id);
		expect(linkedNozomi?.linkedExpenseIds).toEqual([railPass.id]);
		expect(linkedNozomi?.cost).toEqual(nozomi.cost);

		await expect(
			store.deleteExpense({
				expenseId: railPass.id,
				revision: linkedTrip.revision,
				tripId: trip.id,
				userId: owner.id
			})
		).rejects.toMatchObject({ status: 409 });

		const unavailableRailPass = { ...railPass, availableForItemCosts: false };
		await store.saveExpense({
			expense: unavailableRailPass,
			revision: linkedTrip.revision,
			tripId: trip.id,
			userId: owner.id
		});
		const updateLock = await store.acquireItemLock({ itemId: nozomi.id, tripId: trip.id, userId: owner.id });
		await expect(
			store.saveItem({
				item: nozomi,
				itemId: nozomi.id,
				lockToken: updateLock.token,
				revision: linkedTrip.revision + 1,
				tripId: trip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: linkedTrip.revision + 2 });
	});

	it('snapshots an ECB conversion when a sudo owner marks an item cost paid', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-02T12:00:00.000Z'));
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						[
							'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
							'EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,2026-01-02,1.5',
							'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.25'
						].join('\n')
					)
			)
		);

		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id, ['paid-item']);
		const lock = await store.acquireItemLock({ itemId: 'paid-item', tripId: trip.id, userId: owner.id });

		await store.saveItem({
			item: {
				...createEmptyItineraryItem('activity', 'paid-item', Date.UTC(2026, 0, 3)),
				cost: { amountMinor: 10_000, currency: 'USD', scheduledPaymentDate: '2026-01-03', status: 'paid' },
				title: 'paid-item'
			},
			itemId: 'paid-item',
			lockToken: lock.token,
			revision: trip.revision,
			tripId: trip.id,
			userId: owner.id
		});
		const updateLock = await store.acquireItemLock({ itemId: 'paid-item', tripId: trip.id, userId: owner.id });
		await store.saveItem({
			item: {
				...createEmptyItineraryItem('activity', 'paid-item', Date.UTC(2026, 0, 3)),
				cost: { amountMinor: 10_000, currency: 'USD', scheduledPaymentDate: '2026-01-04', status: 'paid' },
				title: 'paid-item'
			},
			itemId: 'paid-item',
			lockToken: updateLock.token,
			revision: trip.revision + 1,
			tripId: trip.id,
			userId: owner.id
		});

		const savedTrip = await store.getTripView(trip.slug, owner);
		if (!savedTrip || savedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the saved trip.');
		}
		const savedItem = savedTrip.itinerary.items.find((item) => item.id === 'paid-item');
		expect(savedItem?.cost).toEqual({
			amountMinor: 10_000,
			currency: 'USD',
			scheduledPaymentDate: '2026-01-04',
			payment: {
				exchangeRate: 1.2,
				localAmountMinor: 12_000,
				localCurrency: 'AUD',
				paidAt: Date.UTC(2026, 0, 2, 12),
				rateDate: '2026-01-02'
			},
			status: 'paid'
		});
	});

	it('marks a scheduled item cost paid without opening the item editor', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-02T12:00:00.000Z'));
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						[
							'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
							'EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,2026-01-02,1.5',
							'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.25'
						].join('\n')
					)
			)
		);

		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const lock = await store.acquireTripStructureLock({ tripId: trip.id, userId: owner.id });
		const item = {
			...createEmptyItineraryItem('activity', 'scheduled-item', Date.UTC(2026, 0, 3)),
			cost: {
				amountMinor: 10_000,
				currency: 'USD' as const,
				scheduledPaymentDate: '2026-01-03',
				status: 'unpaid' as const
			},
			title: 'scheduled-item'
		};
		const created = await store.createItem({
			item,
			lockToken: lock.token,
			revision: trip.revision,
			tripId: trip.id,
			userId: owner.id
		});

		await expect(
			store.markItemCostPaid({
				itemId: item.id,
				revision: created.revision,
				tripId: trip.id,
				userId: owner.id
			})
		).resolves.toEqual({ revision: created.revision + 1 });

		const savedTrip = await store.getTripView(trip.slug, owner);
		if (!savedTrip || savedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the saved trip.');
		}
		expect(savedTrip.itinerary.items.find((candidate) => candidate.id === item.id)?.cost).toEqual({
			amountMinor: 10_000,
			currency: 'USD',
			scheduledPaymentDate: '2026-01-03',
			payment: {
				exchangeRate: 1.2,
				localAmountMinor: 12_000,
				localCurrency: 'AUD',
				paidAt: Date.UTC(2026, 0, 2, 12),
				rateDate: '2026-01-02'
			},
			status: 'paid'
		});
	});

	it('lists empty trips before planned trips ordered by their latest item start', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));

		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		await store.createTrip({
			actorId: owner.id,
			details: { title: 'First empty trip', timeZone: 'UTC' }
		});

		vi.setSystemTime(new Date('2027-01-02T00:00:00.000Z'));
		await store.createTrip({
			actorId: owner.id,
			details: { title: 'Second empty trip', timeZone: 'UTC' }
		});
		const earlierTrip = await store.createTrip({
			actorId: owner.id,
			details: { title: 'Earlier planned trip', timeZone: 'UTC' }
		});
		const laterTrip = await store.createTrip({
			actorId: owner.id,
			details: { title: 'Later planned trip', timeZone: 'UTC' }
		});

		for (const [trip, itemId, startAt] of [
			[earlierTrip, 'earlier-item', Date.UTC(2028, 3, 1)],
			[laterTrip, 'later-item', Date.UTC(2028, 8, 1)]
		] as const) {
			const lock = await store.acquireTripStructureLock({ tripId: trip.id, userId: owner.id });
			await store.createItem({
				item: {
					...createEmptyItineraryItem('activity', itemId, startAt),
					title: itemId
				},
				lockToken: lock.token,
				revision: 0,
				tripId: trip.id,
				userId: owner.id
			});
		}

		const trips = await store.listTripSwitchOptions(owner.id);
		expect(trips.filter((trip) => trip.latestItemStartAt === null).map((trip) => trip.title)).toEqual([
			'Second empty trip',
			'First empty trip'
		]);
		expect(
			trips
				.filter((trip) => trip.latestItemStartAt !== null)
				.slice(0, 2)
				.map((trip) => trip.title)
		).toEqual(['Later planned trip', 'Earlier planned trip']);
	});

	it('manages a shared person’s trip access, role, and password', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const person = await store.createAccount({
			actorId: owner.id,
			password: 'initial strong password',
			username: 'shared-person'
		});

		await expect(store.getTripView(trip.slug, person)).resolves.toBeNull();
		await expect(store.listAccounts(owner.id)).resolves.toEqual([owner, person]);
		await expect(store.listAccounts(person.id)).rejects.toMatchObject({ status: 403 });
		await expect(
			store.createAccount({ actorId: owner.id, password: 'another strong password', username: 'shared-person' })
		).rejects.toMatchObject({
			status: 409
		});
		await expect(store.listAvailableTripAccounts(trip.id, owner.id)).resolves.toEqual([person]);

		await store.grantTripAccess({
			actorId: owner.id,
			role: 'admin',
			tripId: trip.id,
			username: person.username
		});
		await expect(store.listTripMembers(trip.id, owner.id)).resolves.toEqual(
			expect.arrayContaining([
				{ id: owner.id, role: 'sudo', username: owner.username },
				{ id: person.id, role: 'admin', username: person.username }
			])
		);
		await expect(store.listAvailableTripAccounts(trip.id, owner.id)).resolves.toEqual([]);

		await expect(
			store.setSharedUserRole({ actorId: person.id, role: 'user', tripId: trip.id, userId: person.id })
		).rejects.toMatchObject({ status: 403 });
		await store.setSharedUserRole({ actorId: owner.id, role: 'user', tripId: trip.id, userId: person.id });
		await expect(store.getTripView(trip.slug, person)).resolves.toMatchObject({ access: 'user' });

		const sessionId = await store.createSession(person.id);
		await store.resetAccountPassword({
			actorId: owner.id,
			password: 'replacement strong password',
			userId: person.id
		});
		await expect(store.authenticate(person.username, 'initial strong password')).resolves.toBeNull();
		await expect(store.authenticate(person.username, 'replacement strong password')).resolves.toEqual({
			id: person.id,
			username: person.username
		});
		await expect(store.refreshSession(sessionId)).resolves.toBeNull();

		await store.removeTripAccess({ actorId: owner.id, tripId: trip.id, userId: person.id });
		await expect(store.getTripView(trip.slug, person)).resolves.toBeNull();
		await expect(
			store.removeTripAccess({ actorId: owner.id, tripId: trip.id, userId: person.id })
		).rejects.toMatchObject({
			status: 404
		});
	});

	it('reserves sudo password resets for server recovery', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');

		await expect(
			store.resetAccountPassword({
				actorId: owner.id,
				password: 'replacement strong password',
				userId: owner.id
			})
		).rejects.toMatchObject({
			message: 'Reset the sudo account password through the server recovery procedure.',
			status: 409
		});
	});

	it('preserves username capitalization while matching account identities case-insensitively', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('Owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const person = await store.createAccount({
			actorId: owner.id,
			password: 'a second strong test password',
			username: 'User'
		});

		expect(person).toEqual({ id: expect.any(String), username: 'User' });
		await expect(store.authenticate('uSeR', 'a second strong test password')).resolves.toEqual(person);
		await expect(
			store.createAccount({ actorId: owner.id, password: 'another strong password', username: 'USER' })
		).rejects.toMatchObject({ status: 409 });
		await expect(
			store.grantTripAccess({ actorId: owner.id, role: 'user', tripId: trip.id, username: 'UsEr' })
		).resolves.toEqual({ id: person.id, role: 'user', username: 'User' });
	});

	it('lets an account holder change their username and password', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const person = await store.createAccount({
			actorId: owner.id,
			password: 'initial strong password',
			username: 'person'
		});
		const sessionId = await store.createSession(person.id);

		await expect(store.updateOwnUsername({ userId: person.id, username: 'OWNER' })).rejects.toMatchObject({
			status: 409
		});
		await expect(store.updateOwnUsername({ userId: person.id, username: 'Renamed' })).resolves.toEqual({
			id: person.id,
			username: 'Renamed'
		});
		await expect(store.authenticate('person', 'initial strong password')).resolves.toBeNull();
		await expect(store.authenticate('renamed', 'initial strong password')).resolves.toEqual({
			id: person.id,
			username: 'Renamed'
		});

		await expect(
			store.changeOwnPassword({
				currentPassword: 'incorrect password',
				newPassword: 'replacement strong password',
				userId: person.id
			})
		).rejects.toMatchObject({ status: 400 });
		await expect(store.refreshSession(sessionId)).resolves.toEqual({
			renewed: false,
			user: {
				colourway: defaultColourway,
				formatPreferences: defaultFormatPreferences,
				id: person.id,
				username: 'Renamed'
			}
		});

		await store.changeOwnPassword({
			currentPassword: 'initial strong password',
			newPassword: 'replacement strong password',
			userId: person.id
		});
		await expect(store.authenticate('Renamed', 'initial strong password')).resolves.toBeNull();
		await expect(store.authenticate('Renamed', 'replacement strong password')).resolves.toEqual({
			id: person.id,
			username: 'Renamed'
		});
		await expect(store.refreshSession(sessionId)).resolves.toBeNull();
	});

	it('persists an account-wide colourway and exposes it to active sessions', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const sessionId = await store.createSession(user.id);

		await expect(store.updateOwnColourway({ colourway: 'violet', userId: user.id })).resolves.toBe('violet');
		await expect(store.refreshSession(sessionId)).resolves.toEqual({
			renewed: false,
			user: {
				colourway: 'violet',
				formatPreferences: defaultFormatPreferences,
				id: user.id,
				username: user.username
			}
		});

		const persisted: { users: Array<{ colourway: string; id: string }> } = JSON.parse(
			await readFile(managedDataPath('users.json'), 'utf8')
		);
		expect(persisted.users).toEqual(
			expect.arrayContaining([expect.objectContaining({ colourway: 'violet', id: user.id })])
		);
	});

	it('persists account-wide display formats and exposes them to active sessions', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const sessionId = await store.createSession(user.id);
		const formatPreferences = { dateFormat: 'day-month-year', timeFormat: 'twelve-hour' } as const;

		await expect(store.updateOwnFormatPreferences({ ...formatPreferences, userId: user.id })).resolves.toEqual(
			formatPreferences
		);
		await expect(store.refreshSession(sessionId)).resolves.toEqual({
			renewed: false,
			user: { colourway: defaultColourway, formatPreferences, id: user.id, username: user.username }
		});

		const persisted: { users: Array<{ formatPreferences: unknown; id: string }> } = JSON.parse(
			await readFile(managedDataPath('users.json'), 'utf8')
		);
		expect(persisted.users).toEqual(
			expect.arrayContaining([expect.objectContaining({ formatPreferences, id: user.id })])
		);
	});

	it('blocks an attached account from a public trip and can later detach it', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, owner.id);
		const person = await store.createAccount({
			actorId: owner.id,
			password: 'initial strong password',
			username: 'shared-person'
		});

		await expect(store.listOwnedTripOptions(owner.id)).resolves.toEqual([
			{ id: trip.id, slug: trip.slug, title: 'Test trip' }
		]);
		await store.setTripMemberAccess({ actorId: owner.id, role: 'admin', tripId: trip.id, userId: person.id });
		await expect(store.getTripView(trip.slug, person)).resolves.toMatchObject({ access: 'admin' });
		await store.setTripMemberAccess({ actorId: owner.id, role: 'none', tripId: trip.id, userId: person.id });
		await expect(store.listTripMembers(trip.id, owner.id)).resolves.toEqual(
			expect.arrayContaining([{ id: person.id, role: 'none', username: person.username }])
		);
		await expect(store.listAvailableTripAccounts(trip.id, owner.id)).resolves.toEqual([]);
		await store.setTripPublic({ actorId: owner.id, isPublic: true, tripId: trip.id });
		await expect(store.getTripView(trip.slug, person)).resolves.toBeNull();
		await expect(store.listTripSwitchOptions(person.id)).resolves.toEqual([]);

		await store.setTripMemberAccess({ actorId: owner.id, role: null, tripId: trip.id, userId: person.id });
		await expect(store.listAvailableTripAccounts(trip.id, owner.id)).resolves.toEqual([person]);
		await expect(store.getTripView(trip.slug, person)).resolves.toMatchObject({ access: 'visitor' });

		await store.setTripPublic({ actorId: owner.id, isPublic: false, tripId: trip.id });
		await store.setTripMemberAccess({ actorId: owner.id, role: 'user', tripId: trip.id, userId: person.id });
		const sessionId = await store.createSession(person.id);
		await store.deleteAccount({ actorId: owner.id, userId: person.id });

		await expect(store.listAccounts(owner.id)).resolves.toEqual([owner]);
		await expect(store.refreshSession(sessionId)).resolves.toBeNull();
		await expect(store.getTripView(trip.slug, person)).resolves.toBeNull();
		await expect(store.deleteAccount({ actorId: owner.id, userId: owner.id })).rejects.toMatchObject({ status: 409 });
	});

	it('allows only one active edit per trip and preserves the preceding file as a backup', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, user.id, ['first-item', 'second-item']);
		const firstLock = await store.acquireItemLock({
			itemId: 'first-item',
			tripId: trip.id,
			userId: user.id
		});

		await expect(
			store.acquireItemLock({
				itemId: 'second-item',
				tripId: trip.id,
				userId: user.id
			})
		).rejects.toMatchObject({ status: 423 });

		await expect(
			store.releaseItemLock({
				itemId: 'first-item',
				lockToken: '00000000-0000-4000-8000-000000000000',
				tripId: trip.id,
				userId: user.id
			})
		).rejects.toMatchObject({ status: 423 });

		await store.releaseItemLock({
			itemId: 'first-item',
			lockToken: firstLock.token,
			tripId: trip.id,
			userId: user.id
		});
		await store.setTripPublic({ actorId: user.id, isPublic: true, tripId: trip.id });

		const backup: unknown = JSON.parse(await readFile(`${managedTripPath(trip.slug)}.backup`, 'utf8'));
		expect(backup).toMatchObject({ trip: { isPublic: false } });
	});

	it('clears persisted edit locks when a server process starts', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, user.id, ['first-item', 'second-item']);
		await store.acquireItemLock({
			itemId: 'first-item',
			tripId: trip.id,
			userId: user.id
		});

		vi.resetModules();
		const restartedStore = await import('./store');
		await expect(
			restartedStore.acquireItemLock({
				itemId: 'second-item',
				tripId: trip.id,
				userId: user.id
			})
		).resolves.toMatchObject({ revisionAtStart: trip.revision });
	});

	it('lets the sudo owner force close an active edit session', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, user.id, ['first-item', 'second-item']);
		const admin = await store.createAccount({
			actorId: user.id,
			password: 'another strong password',
			username: 'trip-admin'
		});
		await store.grantTripAccess({
			actorId: user.id,
			role: 'admin',
			tripId: trip.id,
			username: admin.username
		});
		await store.acquireItemLock({
			itemId: 'first-item',
			tripId: trip.id,
			userId: user.id
		});
		await expect(store.hasActiveTripEditSession({ tripId: trip.id, userId: user.id })).resolves.toBe(true);

		await expect(store.forceReleaseTripEditLocks({ tripId: trip.id, userId: admin.id })).rejects.toMatchObject({
			status: 403
		});
		await expect(store.forceReleaseTripEditLocks({ tripId: trip.id, userId: user.id })).resolves.toEqual({
			released: 1
		});
		await expect(store.hasActiveTripEditSession({ tripId: trip.id, userId: user.id })).resolves.toBe(false);
		await expect(
			store.acquireItemLock({
				itemId: 'second-item',
				tripId: trip.id,
				userId: user.id
			})
		).resolves.toMatchObject({ revisionAtStart: trip.revision });
	});

	it('lets a sudo owner close all active edit sessions', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		const firstTrip = await createTestTrip(store, owner.id);
		const secondTrip = await store.createTrip({
			actorId: owner.id,
			details: { title: 'Second trip', timeZone: 'UTC' }
		});
		const member = await store.createAccount({
			actorId: owner.id,
			password: 'another strong password',
			username: 'trip-member'
		});
		await expect(store.hasActiveEditSessions(owner.id)).resolves.toBe(false);
		await store.acquireTripStructureLock({ tripId: firstTrip.id, userId: owner.id });
		await store.acquireTripStructureLock({ tripId: secondTrip.id, userId: owner.id });

		await expect(store.hasActiveEditSessions(member.id)).rejects.toMatchObject({ status: 403 });
		await expect(store.hasActiveEditSessions(owner.id)).resolves.toBe(true);
		await expect(store.forceReleaseAllEditLocks(member.id)).rejects.toMatchObject({ status: 403 });
		await expect(store.forceReleaseAllEditLocks(owner.id)).resolves.toEqual({ released: 2 });
		await expect(store.hasActiveEditSessions(owner.id)).resolves.toBe(false);
		await expect(store.hasActiveTripEditSession({ tripId: firstTrip.id, userId: owner.id })).resolves.toBe(false);
		await expect(store.hasActiveTripEditSession({ tripId: secondTrip.id, userId: owner.id })).resolves.toBe(false);
	});

	it('creates and deletes an itinerary item through revisioned lifecycle operations', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const tripReference = await createTestTrip(store, user.id);
		const lock = await store.acquireTripStructureLock({
			tripId: tripReference.id,
			userId: user.id
		});
		const item = {
			...createEmptyItineraryItem('activity', 'tea-ceremony', 1775975400000),
			title: 'Attend a tea ceremony'
		};

		const created = await store.createItem({
			item,
			lockToken: lock.token,
			revision: 0,
			tripId: tripReference.id,
			userId: user.id
		});
		expect(created.revision).toBe(1);

		const trip = await store.getTripView(tripReference.slug, user);
		if (!trip || trip.access !== 'sudo') {
			throw new Error('The sudo user should be able to read the test trip.');
		}
		expect(trip.itinerary.items.some((candidate) => candidate.id === item.id)).toBe(true);

		const deleted = await store.deleteItem({
			itemId: item.id,
			revision: created.revision,
			tripId: tripReference.id,
			userId: user.id
		});
		expect(deleted.revision).toBe(2);
	});

	it('does not allow an existing itinerary item type to change', async () => {
		const store = await import('./store');
		const user = await store.createInitialSudo('owner', 'a strong test password');
		const trip = await createTestTrip(store, user.id, ['locked-item']);
		const lock = await store.acquireItemLock({ itemId: 'locked-item', tripId: trip.id, userId: user.id });
		const replacement = {
			...createEmptyItineraryItem('accommodation', 'locked-item', Date.UTC(2026, 0, 1)),
			title: 'Locked item'
		};

		await expect(
			store.saveItem({
				item: replacement,
				itemId: replacement.id,
				lockToken: lock.token,
				revision: trip.revision,
				tripId: trip.id,
				userId: user.id
			})
		).rejects.toMatchObject({ message: 'An item type cannot be changed after creation.', status: 400 });
	});
});
