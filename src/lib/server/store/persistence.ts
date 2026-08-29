import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { itineraryIdentifierSchema } from '$lib/itinerary/schema';
import { migrateStoredTripFile, migrateStoredUsersFile, migrateTripsToSudoOwnership } from './migrations';
import {
	storedDataSchema,
	storedDataVersion,
	storedEditLocksFileSchema,
	storedSharesFileSchema,
	storedSessionsFileSchema,
	storedTripFileSchema,
	storedTripSchema,
	storedUsersFileSchema,
	sudoPasswordResetPrefix,
	sudoPasswordResetPassword,
	type PersistedTrip,
	type StoredData,
	type StoredTrip,
	type StoredUser
} from './model';
import { preparePasswordHash } from './password';
import { isExpired } from './time';

const jsonIndentation = 4;
const dataDirectory = process.env.SHIORI_DATA_DIRECTORY ?? join(process.cwd(), 'data');
const tripsDataDirectory = join(dataDirectory, 'trips');
const usersDataPath = join(dataDirectory, 'users.json');
const sharesDataPath = join(dataDirectory, 'shares.json');
const sessionsDataPath = join(dataDirectory, 'sessions.json');
const editLocksDataPath = join(dataDirectory, 'edit-locks.json');

type GlobalDataDomain = 'users' | 'shares' | 'sessions' | 'editLocks';
type GlobalDataFile = {
	content: (data: StoredData) => unknown;
	path: string;
};

const globalDataFiles = {
	users: {
		content: (data) => ({ version: storedDataVersion, users: data.users }),
		path: usersDataPath
	},
	shares: {
		content: (data) => ({ version: storedDataVersion, shares: data.shares }),
		path: sharesDataPath
	},
	sessions: {
		content: (data) => ({ version: storedDataVersion, sessions: data.sessions }),
		path: sessionsDataPath
	},
	editLocks: {
		content: (data) => ({ version: storedDataVersion, editLocks: data.editLocks }),
		path: editLocksDataPath
	}
} satisfies Record<GlobalDataDomain, GlobalDataFile>;
const globalDataPaths = Object.values(globalDataFiles).map((file) => file.path);

type ManagedTripDataFile = {
	path: string;
	slug: string;
};
type ReadStoredDataResult = {
	data: StoredData;
	migrationRequired: boolean;
	sudoPasswordResetConsumed: boolean;
};
type SessionData = Pick<StoredData, 'sessions' | 'users'>;
type SessionTransactionResult<Result> = {
	changed: boolean;
	value: Result;
};
type DataWriteScope<Result> = {
	global: readonly GlobalDataDomain[];
	tripIds: 'all' | readonly string[] | ((result: Result) => readonly string[]);
};
type ResolvedDataWriteScope = {
	global: readonly GlobalDataDomain[];
	tripIds: 'all' | readonly string[];
};
type DataWriteOptions = {
	firstGlobalDomain?: GlobalDataDomain;
	preserveGlobalBackups?: readonly GlobalDataDomain[];
};
type PendingSudoPasswordReset = {
	password: string;
	user: StoredUser;
};

let transactionTail: Promise<void> = Promise.resolve();
let startupInitialization: Promise<void> | undefined;
let cachedData: StoredData | undefined;
let pendingDataRead: Promise<StoredData> | undefined;

const allGlobalDataDomains = [
	'users',
	'shares',
	'sessions',
	'editLocks'
] as const satisfies readonly GlobalDataDomain[];
const allDataWriteScope: ResolvedDataWriteScope = { global: allGlobalDataDomains, tripIds: 'all' };

function defaultData(): StoredData {
	return {
		version: storedDataVersion,
		users: [],
		trips: [],
		shares: [],
		sessions: [],
		editLocks: []
	};
}

function managedTripDataPath(slug: string): string {
	return join(tripsDataDirectory, `${slug}.json`);
}

function hasSplitData(): boolean {
	return globalDataPaths.some((filePath) => existsSync(filePath)) || existsSync(tripsDataDirectory);
}

async function readJsonFile(filePath: string): Promise<unknown> {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

async function tripDataFiles(): Promise<ManagedTripDataFile[]> {
	if (!existsSync(tripsDataDirectory)) {
		return [];
	}

	const entries = await readdir(tripsDataDirectory, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) => ({
			path: join(tripsDataDirectory, entry.name),
			slug: itineraryIdentifierSchema.parse(entry.name.slice(0, -'.json'.length))
		}));
}

async function consumeSudoPasswordReset(data: StoredData): Promise<boolean> {
	let pendingReset: PendingSudoPasswordReset | undefined;
	for (const user of data.users) {
		const password = sudoPasswordResetPassword(user.passwordHash);
		if (password === undefined) {
			continue;
		}
		if (!user.isSudo || pendingReset) {
			throw new Error(`The ${sudoPasswordResetPrefix} password marker may only be used for the single sudo account.`);
		}
		pendingReset = { password, user };
	}
	if (!pendingReset) {
		return false;
	}

	pendingReset.user.passwordHash = await preparePasswordHash(pendingReset.password);
	data.sessions = data.sessions.filter((session) => session.userId !== pendingReset.user.id);
	return true;
}

async function readSplitStoredData(): Promise<ReadStoredDataResult> {
	const missingFiles = globalDataPaths.filter((filePath) => !existsSync(filePath));
	if (missingFiles.length > 0) {
		throw new Error(
			`Split Shiori data is incomplete. Missing ${missingFiles.map((filePath) => basename(filePath)).join(', ')}.`
		);
	}

	const managedTripFiles = await tripDataFiles();
	const [usersFile, sharesFile, sessionsFile, editLocksFile, tripFiles] = await Promise.all([
		readJsonFile(usersDataPath),
		readJsonFile(sharesDataPath),
		readJsonFile(sessionsDataPath),
		readJsonFile(editLocksDataPath),
		Promise.all(
			managedTripFiles.map(async (tripDataFile) => ({
				file: await readJsonFile(tripDataFile.path),
				slug: tripDataFile.slug
			}))
		)
	]);
	const migratedUsersFile = migrateStoredUsersFile(usersFile);
	const users = storedUsersFileSchema.parse(migratedUsersFile.file);
	const shares = storedSharesFileSchema.parse(sharesFile);
	const sessions = storedSessionsFileSchema.parse(sessionsFile);
	const editLocks = storedEditLocksFileSchema.parse(editLocksFile);
	const migratedTripFiles = tripFiles.map(({ file, slug }) => ({
		...migrateStoredTripFile(file),
		slug
	}));
	const trips = migratedTripFiles.map(({ file, slug }) => {
		const trip = storedTripFileSchema.parse(file).trip;
		return storedTripSchema.parse({ ...trip, slug });
	});

	const ownershipMigrationRequired =
		migratedUsersFile.migrationRequired || migratedTripFiles.some((tripFile) => tripFile.migrationRequired);
	const data: StoredData = {
		version: storedDataVersion,
		users: users.users,
		trips,
		shares: shares.shares,
		sessions: sessions.sessions,
		editLocks: editLocks.editLocks
	};
	const tripOwnershipMigrated = ownershipMigrationRequired ? migrateTripsToSudoOwnership(data) : false;
	const validatedData = storedDataSchema.parse(data);
	const sudoPasswordResetConsumed = await consumeSudoPasswordReset(validatedData);

	return {
		data: validatedData,
		migrationRequired:
			migratedUsersFile.migrationRequired ||
			shares.version !== storedDataVersion ||
			sessions.version !== storedDataVersion ||
			editLocks.version !== storedDataVersion ||
			migratedTripFiles.some((tripFile) => tripFile.migrationRequired) ||
			tripOwnershipMigrated,
		sudoPasswordResetConsumed
	};
}

async function readStoredData(): Promise<ReadStoredDataResult> {
	if (hasSplitData()) {
		return readSplitStoredData();
	}
	return { data: defaultData(), migrationRequired: false, sudoPasswordResetConsumed: false };
}

async function readCachedData(): Promise<StoredData> {
	if (cachedData) {
		return structuredClone(cachedData);
	}

	pendingDataRead ??= readStoredData()
		.then(({ data }) => {
			cachedData = data;
			return data;
		})
		.finally(() => {
			pendingDataRead = undefined;
		});
	return structuredClone(await pendingDataRead);
}

function replaceCachedData(data: StoredData): void {
	cachedData = data;
}

function invalidateCachedData(): void {
	cachedData = undefined;
}

function replaceCachedSessionData(data: SessionData): void {
	if (!cachedData) {
		return;
	}
	cachedData = { ...cachedData, sessions: data.sessions, users: data.users };
}

async function readSessionData(): Promise<SessionData> {
	if (!hasSplitData()) {
		return { sessions: [], users: [] };
	}

	const [usersFile, sessionsFile] = await Promise.all([readJsonFile(usersDataPath), readJsonFile(sessionsDataPath)]);
	const users = storedUsersFileSchema.parse(usersFile);
	const sessions = storedSessionsFileSchema.parse(sessionsFile);
	return { sessions: sessions.sessions, users: users.users };
}

async function synchronizeDirectory(directoryPath: string): Promise<void> {
	const directory = await open(directoryPath, 'r');
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

async function writeDurableFile(destinationPath: string, source: string): Promise<void> {
	const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;
	let renamed = false;

	try {
		const temporaryFile = await open(temporaryPath, 'wx', 0o600);
		try {
			await temporaryFile.writeFile(source, 'utf8');
			await temporaryFile.sync();
		} finally {
			await temporaryFile.close();
		}

		await rename(temporaryPath, destinationPath);
		renamed = true;
		await synchronizeDirectory(dirname(destinationPath));
	} catch (error: unknown) {
		if (!renamed) {
			await unlink(temporaryPath).catch(() => undefined);
		}
		throw error;
	}
}

function persistTrip(trip: StoredTrip): PersistedTrip {
	return {
		id: trip.id,
		ownerId: trip.ownerId,
		isPublic: trip.isPublic,
		revision: trip.revision,
		itinerary: trip.itinerary,
		createdAt: trip.createdAt,
		updatedAt: trip.updatedAt
	};
}

async function writeManagedJsonFile(filePath: string, data: unknown, preserveExistingBackup = false): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	if (existsSync(filePath) && !preserveExistingBackup) {
		await writeDurableFile(`${filePath}.backup`, await readFile(filePath, 'utf8'));
	}
	await writeDurableFile(filePath, `${JSON.stringify(data, null, jsonIndentation)}\n`);
}

function tripForWrite(data: StoredData, tripId: string): StoredTrip {
	const trip = data.trips.find((candidate) => candidate.id === tripId);
	if (!trip) {
		throw new Error(`Cannot persist missing trip ${tripId}.`);
	}
	return trip;
}

async function writeData(
	data: StoredData,
	scope: ResolvedDataWriteScope = allDataWriteScope,
	options: DataWriteOptions = {}
): Promise<StoredData> {
	const validated = storedDataSchema.parse(data);
	const requestedGlobalDomains = new Set(scope.global);
	const preservedGlobalBackups = new Set(options.preserveGlobalBackups);
	const globalDomains = globalDataPaths.some((filePath) => !existsSync(filePath))
		? allGlobalDataDomains
		: [...requestedGlobalDomains];
	const firstGlobalDomain =
		options.firstGlobalDomain && globalDomains.includes(options.firstGlobalDomain)
			? options.firstGlobalDomain
			: undefined;
	if (firstGlobalDomain) {
		const file = globalDataFiles[firstGlobalDomain];
		await writeManagedJsonFile(file.path, file.content(validated), preservedGlobalBackups.has(firstGlobalDomain));
	}
	const remainingGlobalDomains = firstGlobalDomain
		? globalDomains.filter((domain) => domain !== firstGlobalDomain)
		: globalDomains;
	const trips =
		scope.tripIds === 'all' ? validated.trips : scope.tripIds.map((tripId) => tripForWrite(validated, tripId));
	const writeResults = await Promise.allSettled([
		...remainingGlobalDomains.map((domain) => {
			const file = globalDataFiles[domain];
			return writeManagedJsonFile(file.path, file.content(validated), preservedGlobalBackups.has(domain));
		}),
		...trips.map((trip) =>
			writeManagedJsonFile(managedTripDataPath(trip.slug), {
				version: storedDataVersion,
				trip: persistTrip(trip)
			})
		)
	]);
	for (const result of writeResults) {
		if (result.status === 'rejected') {
			throw result.reason;
		}
	}
	return validated;
}

async function writeSessions(data: SessionData): Promise<void> {
	const sessions = storedSessionsFileSchema.parse({ version: storedDataVersion, sessions: data.sessions });
	await writeManagedJsonFile(sessionsDataPath, sessions);
}

function purgeExpiredRecords(data: StoredData): void {
	data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
	data.editLocks = data.editLocks.filter((lock) => !isExpired(lock.expiresAt));
}

async function initializePersistedData(): Promise<void> {
	const { data, migrationRequired, sudoPasswordResetConsumed } = await readStoredData();
	const hasPersistedEditLocks = data.editLocks.length > 0;
	if (!hasPersistedEditLocks && !migrationRequired && !sudoPasswordResetConsumed) {
		replaceCachedData(data);
		return;
	}

	data.editLocks = [];
	const globalDomains = new Set<GlobalDataDomain>();
	if (sudoPasswordResetConsumed) {
		globalDomains.add('users');
		globalDomains.add('sessions');
	}
	if (hasPersistedEditLocks) {
		globalDomains.add('editLocks');
	}
	replaceCachedData(
		await writeData(
			data,
			migrationRequired ? allDataWriteScope : { global: [...globalDomains], tripIds: [] },
			sudoPasswordResetConsumed
				? {
						// Do not make a new sudo password usable while an old sudo session could survive an I/O failure.
						firstGlobalDomain: 'sessions',
						preserveGlobalBackups: ['users']
					}
				: {}
		)
	);
}

async function completeStartupInitialization(): Promise<void> {
	startupInitialization ??= initializePersistedData();
	await startupInitialization;
}

/** Completes validation and startup maintenance before the application accepts requests. */
export async function initializeStore(): Promise<void> {
	await completeStartupInitialization();
}

export async function readData(): Promise<StoredData> {
	await initializeStore();
	return readCachedData();
}

async function runSerializedTransaction<Result>(operation: () => Promise<Result>): Promise<Result> {
	let release: (() => void) | undefined;
	const nextTransaction = new Promise<void>((resolve) => {
		release = resolve;
	});
	const previousTransaction = transactionTail;
	transactionTail = nextTransaction;
	await previousTransaction;

	try {
		return await operation();
	} finally {
		release?.();
	}
}

export async function transaction<Result>(
	operation: (data: StoredData) => Promise<Result> | Result,
	scope: DataWriteScope<Result> = allDataWriteScope
): Promise<Result> {
	return runSerializedTransaction(async () => {
		const data = await readData();
		const initialSessionCount = data.sessions.length;
		const initialEditLockCount = data.editLocks.length;
		purgeExpiredRecords(data);
		const result = await operation(data);
		const globalDomains = new Set(scope.global);
		if (data.sessions.length !== initialSessionCount) {
			globalDomains.add('sessions');
		}
		if (data.editLocks.length !== initialEditLockCount) {
			globalDomains.add('editLocks');
		}
		try {
			const validated = await writeData(data, {
				global: [...globalDomains],
				tripIds: typeof scope.tripIds === 'function' ? scope.tripIds(result) : scope.tripIds
			});
			replaceCachedData(validated);
		} catch (error: unknown) {
			invalidateCachedData();
			throw error;
		}
		return result;
	});
}

export async function sessionTransaction<Result>(
	operation: (data: SessionData) => Promise<SessionTransactionResult<Result>> | SessionTransactionResult<Result>
): Promise<Result> {
	return runSerializedTransaction(async () => {
		await completeStartupInitialization();
		const data = await readSessionData();
		const sessionCount = data.sessions.length;
		data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
		const result = await operation(data);
		if (result.changed || data.sessions.length !== sessionCount) {
			try {
				await writeSessions(data);
				replaceCachedSessionData(data);
			} catch (error: unknown) {
				invalidateCachedData();
				throw error;
			}
		}
		return result.value;
	});
}
