import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyItineraryItem } from '../itinerary/draft';

let dataDirectory = '';

type StoreModule = typeof import('./store');

type TestTrip = {
	id: string;
	revision: number;
	slug: string;
};

function managedTripPath(slug: string): string {
	return join(dataDirectory, 'trips', `${slug}.json`);
}

function managedDataPath(filename: string): string {
	return join(dataDirectory, filename);
}

async function createTestTrip(store: StoreModule, ownerId: string, itemIds: readonly string[] = []): Promise<TestTrip> {
	const trip = await store.createTrip({
		details: { title: 'Test trip', timeZone: 'UTC' },
		ownerId
	});
	let revision = 0;

	for (const itemId of itemIds) {
		const lock = await store.acquireTripStructureLock({ tripId: trip.id, userId: ownerId });
		const result = await store.createItem({
			item: {
				...createEmptyItineraryItem('activity', itemId, Date.UTC(2026, 0, 1)),
				title: itemId
			},
			lockToken: lock.token,
			revision,
			tripId: trip.id,
			userId: ownerId
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
			expect(source).toContain('\n    "version": 7');
			expect(source).toMatch(/\n$/);
		}
		expect(JSON.parse(users)).toMatchObject({ version: 7, users: [{ username: 'owner' }] });
		expect(JSON.parse(trip)).toMatchObject({ version: 7, trip: { id: expect.any(String) } });
		expect(JSON.parse(trip)).not.toHaveProperty('trip.slug');
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

	it('migrates version 6 cost records to the flat version 7 shape on startup', async () => {
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
		legacyItem.cost = {
			amount: { amountMinor: 12_500, currency: 'USD' },
			payment: {
				exchangeRate: 1.2,
				localAmount: { amountMinor: 15_000, currency: 'AUD' },
				paidAt: Date.UTC(2026, 3, 3),
				rateDate: '2026-04-03'
			},
			status: 'paid'
		};
		persistedTrip.version = 6;
		await writeFile(managedTripPath(trip.slug), JSON.stringify(persistedTrip, null, 4), 'utf8');

		for (const filePath of [
			managedDataPath('users.json'),
			managedDataPath('shares.json'),
			managedDataPath('sessions.json'),
			managedDataPath('edit-locks.json')
		]) {
			const persistedGlobalData: { version: number } = JSON.parse(await readFile(filePath, 'utf8'));
			persistedGlobalData.version = 6;
			await writeFile(filePath, JSON.stringify(persistedGlobalData, null, 4), 'utf8');
		}

		vi.resetModules();
		const restartedStore = await import('./store');
		const migratedTrip = await restartedStore.getTripView(trip.slug, owner);
		if (!migratedTrip || migratedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the migrated trip.');
		}
		expect(migratedTrip.itinerary.items.find((item) => item.id === 'legacy-cost')?.cost).toEqual({
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
		expect(migratedFiles.map((file) => file.version)).toEqual([7, 7, 7, 7, 7]);
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
								passwordHash: 'test-password-hash',
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

	it('creates a private empty trip and updates its basic details', async () => {
		const store = await import('./store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');

		const created = await store.createTrip({
			details: { title: 'Summer in Montréal', timeZone: 'America/Toronto' },
			ownerId: owner.id
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
				cost: { amount: 10_000, currency: 'USD', status: 'paid' },
				title: 'paid-item'
			},
			itemId: 'paid-item',
			lockToken: lock.token,
			revision: trip.revision,
			tripId: trip.id,
			userId: owner.id
		});

		const savedTrip = await store.getTripView(trip.slug, owner);
		if (!savedTrip || savedTrip.access !== 'sudo') {
			throw new Error('The owner should be able to read the saved trip.');
		}
		const savedItem = savedTrip.itinerary.items.find((item) => item.id === 'paid-item');
		expect(savedItem?.cost).toEqual({
			amount: 10_000,
			currency: 'USD',
			payment: {
				exchangeRate: 1.2,
				localAmount: 12_000,
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
			details: { title: 'First empty trip', timeZone: 'UTC' },
			ownerId: owner.id
		});

		vi.setSystemTime(new Date('2027-01-02T00:00:00.000Z'));
		await store.createTrip({
			details: { title: 'Second empty trip', timeZone: 'UTC' },
			ownerId: owner.id
		});
		const earlierTrip = await store.createTrip({
			details: { title: 'Earlier planned trip', timeZone: 'UTC' },
			ownerId: owner.id
		});
		const laterTrip = await store.createTrip({
			details: { title: 'Later planned trip', timeZone: 'UTC' },
			ownerId: owner.id
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
		const admin = await store.createSharedUser({
			actorId: user.id,
			password: 'another strong password',
			role: 'admin',
			tripId: trip.id,
			username: 'trip-admin'
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
});
