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
			expect(source).toContain('\n    "version": 12');
			expect(source).toMatch(/\n$/);
		}
		expect(JSON.parse(users)).toMatchObject({ version: 12, users: [{ username: 'owner' }] });
		expect(JSON.parse(trip)).toMatchObject({ version: 12, trip: { id: expect.any(String) } });
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
			version: 12
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
			expect(migratedFiles.map((file) => file.version)).toEqual([12, 12, 12, 12, 12]);
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
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({ version: 12 });
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
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({ version: 12 });
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
		expect(JSON.parse(await readFile(managedTripPath(trip.slug), 'utf8'))).toMatchObject({ version: 12 });
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
			date: '2026-01-02',
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

		const replacementNote = { ...dayNote, text: 'A shorter afternoon plan.' };
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
				target: { date: dayNote.date, kind: 'day' },
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
