import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { itineraryIdentifierSchema } from '$lib/itinerary/schema';
import { migrateStoredTripFile } from './migrations';
import {
	storedDataSchema,
	storedDataVersion,
	storedEditLocksFileSchema,
	storedSharesFileSchema,
	storedSessionsFileSchema,
	storedTripFileSchema,
	storedTripSchema,
	storedUsersFileSchema,
	type PersistedTrip,
	type StoredData,
	type StoredTrip
} from './model';
import { isExpired } from './time';

const jsonIndentation = 4;
const dataDirectory = process.env.SHIORI_DATA_DIRECTORY ?? join(process.cwd(), 'data');
const tripsDataDirectory = join(dataDirectory, 'trips');
const usersDataPath = join(dataDirectory, 'users.json');
const sharesDataPath = join(dataDirectory, 'shares.json');
const sessionsDataPath = join(dataDirectory, 'sessions.json');
const editLocksDataPath = join(dataDirectory, 'edit-locks.json');
const globalDataPaths = [usersDataPath, sharesDataPath, sessionsDataPath, editLocksDataPath];

type ManagedTripDataFile = {
	path: string;
	slug: string;
};
type ReadStoredDataResult = {
	data: StoredData;
	migrationRequired: boolean;
};
type SessionData = Pick<StoredData, 'sessions' | 'users'>;
type SessionTransactionResult<Result> = {
	changed: boolean;
	value: Result;
};

let transactionTail: Promise<void> = Promise.resolve();
let startupLockCleanup: Promise<void> | undefined;

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
	const users = storedUsersFileSchema.parse(usersFile);
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

	return {
		data: storedDataSchema.parse({
			version: storedDataVersion,
			users: users.users,
			trips,
			shares: shares.shares,
			sessions: sessions.sessions,
			editLocks: editLocks.editLocks
		}),
		migrationRequired:
			users.version !== storedDataVersion ||
			shares.version !== storedDataVersion ||
			sessions.version !== storedDataVersion ||
			editLocks.version !== storedDataVersion ||
			migratedTripFiles.some((tripFile) => tripFile.migrationRequired)
	};
}

async function readStoredData(): Promise<ReadStoredDataResult> {
	if (hasSplitData()) {
		return readSplitStoredData();
	}
	return { data: defaultData(), migrationRequired: false };
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

async function writeManagedJsonFile(filePath: string, data: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	if (existsSync(filePath)) {
		await writeDurableFile(`${filePath}.backup`, await readFile(filePath, 'utf8'));
	}
	await writeDurableFile(filePath, `${JSON.stringify(data, null, jsonIndentation)}\n`);
}

async function writeData(data: StoredData): Promise<void> {
	const validated = storedDataSchema.parse(data);
	await Promise.all([
		writeManagedJsonFile(usersDataPath, {
			version: storedDataVersion,
			users: validated.users
		}),
		writeManagedJsonFile(sharesDataPath, {
			version: storedDataVersion,
			shares: validated.shares
		}),
		writeManagedJsonFile(sessionsDataPath, {
			version: storedDataVersion,
			sessions: validated.sessions
		}),
		writeManagedJsonFile(editLocksDataPath, {
			version: storedDataVersion,
			editLocks: validated.editLocks
		}),
		...validated.trips.map((trip) =>
			writeManagedJsonFile(managedTripDataPath(trip.slug), {
				version: storedDataVersion,
				trip: persistTrip(trip)
			})
		)
	]);
}

async function writeSessions(data: SessionData): Promise<void> {
	const sessions = storedSessionsFileSchema.parse({ version: storedDataVersion, sessions: data.sessions });
	await writeManagedJsonFile(sessionsDataPath, sessions);
}

function purgeExpiredRecords(data: StoredData): void {
	data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
	data.editLocks = data.editLocks.filter((lock) => !isExpired(lock.expiresAt));
}

async function clearPersistedEditLocksAtStartup(): Promise<void> {
	const { data, migrationRequired } = await readStoredData();
	if (data.editLocks.length === 0 && !migrationRequired) {
		return;
	}

	data.editLocks = [];
	await writeData(data);
}

async function completeStartupLockCleanup(): Promise<void> {
	startupLockCleanup ??= clearPersistedEditLocksAtStartup();
	await startupLockCleanup;
}

export async function readData(): Promise<StoredData> {
	await completeStartupLockCleanup();
	return (await readStoredData()).data;
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

export async function transaction<Result>(operation: (data: StoredData) => Promise<Result> | Result): Promise<Result> {
	return runSerializedTransaction(async () => {
		const data = await readData();
		purgeExpiredRecords(data);
		const result = await operation(data);
		await writeData(data);
		return result;
	});
}

export async function sessionTransaction<Result>(
	operation: (data: SessionData) => Promise<SessionTransactionResult<Result>> | SessionTransactionResult<Result>
): Promise<Result> {
	return runSerializedTransaction(async () => {
		await completeStartupLockCleanup();
		const data = await readSessionData();
		const sessionCount = data.sessions.length;
		data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
		const result = await operation(data);
		if (result.changed || data.sessions.length !== sessionCount) {
			await writeSessions(data);
		}
		return result.value;
	});
}
