import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { minimumPasswordLength, passwordMinimumMessage } from '$lib/auth/password-policy';
import {
	projectDetailedItinerary,
	projectPublicItinerary,
	type PublicItinerary,
	type TripAccessRole
} from '$lib/itinerary/access';
import {
	itineraryIdentifierSchema,
	itineraryItemSchema,
	itinerarySchema,
	tripDetailsSchema,
	unixTimestampSchema,
	type Itinerary,
	type TripDetails
} from '$lib/itinerary/schema';
import { timingStartTimestamp } from '$lib/itinerary/timing';

const sessionLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;
const editLockLifetimeMilliseconds = 10 * 60 * 1000;
const storedDataVersion = 6;
const tripStructureLockTargetId = 'trip-structure';
const jsonIndentation = 4;

const usernameSchema = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9_-]{2,31}$/i, 'Use 3–32 letters, numbers, underscores, or hyphens.');
const passwordSchema = z
	.string()
	.min(minimumPasswordLength, passwordMinimumMessage())
	.max(1024, 'Use at most 1,024 characters for a password.');
const timestampSchema = unixTimestampSchema;

const shareRoleSchema = z.enum(['user', 'admin']);

const storedUserSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	username: usernameSchema,
	passwordHash: z.string().min(1),
	createdAt: timestampSchema
});

const persistedTripSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	ownerId: itineraryIdentifierSchema.nullable(),
	isPublic: z.boolean(),
	revision: z.number().int().nonnegative(),
	itinerary: itinerarySchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema
});
const storedTripSchema = persistedTripSchema.extend({
	slug: itineraryIdentifierSchema
});

const storedShareSchema = z.strictObject({
	tripId: itineraryIdentifierSchema,
	userId: itineraryIdentifierSchema,
	role: shareRoleSchema
});

const storedSessionSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	userId: itineraryIdentifierSchema,
	expiresAt: timestampSchema
});

const storedEditLockSchema = z.strictObject({
	tripId: itineraryIdentifierSchema,
	targetId: itineraryIdentifierSchema,
	ownerId: itineraryIdentifierSchema,
	token: z.string().uuid(),
	acquiredAt: timestampSchema,
	expiresAt: timestampSchema,
	revisionAtStart: z.number().int().nonnegative()
});

const storedUsersFileSchema = z.strictObject({
	version: z.literal(storedDataVersion),
	users: z.array(storedUserSchema)
});
const storedSharesFileSchema = z.strictObject({
	version: z.literal(storedDataVersion),
	shares: z.array(storedShareSchema)
});
const storedSessionsFileSchema = z.strictObject({
	version: z.literal(storedDataVersion),
	sessions: z.array(storedSessionSchema)
});
const storedEditLocksFileSchema = z.strictObject({
	version: z.literal(storedDataVersion),
	editLocks: z.array(storedEditLockSchema)
});
const storedTripFileSchema = z.strictObject({
	version: z.literal(storedDataVersion),
	trip: persistedTripSchema
});

const storedDataSchema = z
	.strictObject({
		version: z.literal(storedDataVersion),
		users: z.array(storedUserSchema),
		trips: z.array(storedTripSchema),
		shares: z.array(storedShareSchema),
		sessions: z.array(storedSessionSchema),
		editLocks: z.array(storedEditLockSchema)
	})
	.superRefine((data, context) => {
		const userIds = new Set<string>();
		const usernames = new Set<string>();
		for (const [index, user] of data.users.entries()) {
			if (userIds.has(user.id)) {
				context.addIssue({
					code: 'custom',
					path: ['users', index, 'id'],
					message: 'Each user ID must be unique.'
				});
			}
			userIds.add(user.id);

			const username = user.username.toLowerCase();
			if (usernames.has(username)) {
				context.addIssue({
					code: 'custom',
					path: ['users', index, 'username'],
					message: 'Each username must be unique.'
				});
			}
			usernames.add(username);
		}

		const tripIds = new Set<string>();
		const tripSlugs = new Set<string>();
		for (const [index, trip] of data.trips.entries()) {
			if (tripIds.has(trip.id)) {
				context.addIssue({
					code: 'custom',
					path: ['trips', index, 'id'],
					message: 'Each trip ID must be unique.'
				});
			}
			tripIds.add(trip.id);

			if (tripSlugs.has(trip.slug)) {
				context.addIssue({
					code: 'custom',
					path: ['trips', index, 'slug'],
					message: 'Each trip slug must be unique.'
				});
			}
			tripSlugs.add(trip.slug);

			if (trip.ownerId !== null && !userIds.has(trip.ownerId)) {
				context.addIssue({
					code: 'custom',
					path: ['trips', index, 'ownerId'],
					message: 'A trip owner must reference an existing user.'
				});
			}
		}
		const tripsById = new Map(data.trips.map((trip) => [trip.id, trip]));

		const sharedAccess = new Set<string>();
		for (const [index, share] of data.shares.entries()) {
			const trip = tripsById.get(share.tripId);
			if (!trip) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index, 'tripId'],
					message: 'A share must reference an existing trip.'
				});
			} else if (trip.ownerId === share.userId) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index, 'userId'],
					message: 'A trip owner cannot have a redundant shared-access record.'
				});
			}
			if (!userIds.has(share.userId)) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index, 'userId'],
					message: 'A share must reference an existing user.'
				});
			}

			const shareKey = `${share.tripId}:${share.userId}`;
			if (sharedAccess.has(shareKey)) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index],
					message: 'A user can have only one share for a trip.'
				});
			}
			sharedAccess.add(shareKey);
		}

		const sessionIds = new Set<string>();
		for (const [index, session] of data.sessions.entries()) {
			if (sessionIds.has(session.id)) {
				context.addIssue({
					code: 'custom',
					path: ['sessions', index, 'id'],
					message: 'Each session ID must be unique.'
				});
			}
			sessionIds.add(session.id);
			if (!userIds.has(session.userId)) {
				context.addIssue({
					code: 'custom',
					path: ['sessions', index, 'userId'],
					message: 'A session must reference an existing user.'
				});
			}
		}

		const lockTokens = new Set<string>();
		const lockedTrips = new Set<string>();
		for (const [index, lock] of data.editLocks.entries()) {
			const trip = tripsById.get(lock.tripId);
			if (lockTokens.has(lock.token)) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'token'],
					message: 'Each edit lock token must be unique.'
				});
			}
			lockTokens.add(lock.token);
			if (lockedTrips.has(lock.tripId)) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'tripId'],
					message: 'A trip can have only one active edit lock.'
				});
			}
			lockedTrips.add(lock.tripId);
			if (!trip) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'tripId'],
					message: 'An edit lock must reference an existing trip.'
				});
			}
			if (!userIds.has(lock.ownerId)) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'ownerId'],
					message: 'An edit lock must reference an existing user.'
				});
			}
			if (trip && lock.ownerId !== trip.ownerId) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'ownerId'],
					message: 'An edit lock must belong to the trip owner.'
				});
			}
			if (
				trip &&
				lock.targetId !== tripStructureLockTargetId &&
				!trip.itinerary.items.some((item) => item.id === lock.targetId)
			) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'targetId'],
					message: 'An edit lock must target the trip structure or an existing itinerary item.'
				});
			}
		}
	});

type StoredData = z.infer<typeof storedDataSchema>;
type StoredTrip = z.infer<typeof storedTripSchema>;
type PersistedTrip = z.infer<typeof persistedTripSchema>;
type StoredEditLock = z.infer<typeof storedEditLockSchema>;
type ManagedTripDataFile = {
	path: string;
	slug: string;
};

export type AuthenticatedUser = Pick<z.infer<typeof storedUserSchema>, 'id' | 'username'>;
export type ShareRole = z.infer<typeof shareRoleSchema>;
export type {
	DetailedTripAccessRole,
	PublicItinerary,
	PublicItineraryItem,
	TripAccessRole
} from '$lib/itinerary/access';

export type VisitorTripView = {
	access: 'visitor';
	canEdit: false;
	id: string;
	isPublic: boolean;
	revision: number;
	slug: string;
	itinerary: PublicItinerary;
};

export type DetailedTripView = {
	access: 'user' | 'admin' | 'sudo';
	canEdit: boolean;
	id: string;
	isPublic: boolean;
	revision: number;
	slug: string;
	itinerary: Itinerary;
};

export type TripView = VisitorTripView | DetailedTripView;

export type TripReference = {
	id: string;
	slug: string;
};

export type TripSwitchOption = {
	latestItemStartAt: number | null;
	slug: string;
	title: string;
	updatedAt: number;
};

export type TripMember = {
	id: string;
	role: 'admin' | 'sudo' | 'user';
	username: string;
};

export type EditLock = Pick<StoredEditLock, 'expiresAt' | 'revisionAtStart' | 'token'>;

export class StoreError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'StoreError';
	}
}

const dataDirectory = process.env.SHIORI_DATA_DIRECTORY ?? join(process.cwd(), 'data');
const tripsDataDirectory = join(dataDirectory, 'trips');
const usersDataPath = join(dataDirectory, 'users.json');
const sharesDataPath = join(dataDirectory, 'shares.json');
const sessionsDataPath = join(dataDirectory, 'sessions.json');
const editLocksDataPath = join(dataDirectory, 'edit-locks.json');
let transactionTail: Promise<void> = Promise.resolve();
let startupLockCleanup: Promise<void> | undefined;

function timestamp(): number {
	return Date.now();
}

function derivePasswordKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scryptCallback(password, salt, keyLength, (error, derivedKey) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(derivedKey);
		});
	});
}

function futureTimestamp(milliseconds: number): number {
	return Date.now() + milliseconds;
}

function isExpired(expiresAt: number): boolean {
	return expiresAt <= Date.now();
}

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

const globalDataPaths = [usersDataPath, sharesDataPath, sessionsDataPath, editLocksDataPath];

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

async function readSplitStoredData(): Promise<StoredData> {
	const missingFiles = globalDataPaths.filter((filePath) => !existsSync(filePath));
	if (missingFiles.length > 0) {
		throw new Error(
			`Split Shiori data is incomplete. Missing ${missingFiles.map((filePath) => basename(filePath)).join(', ')}.`
		);
	}

	const managedTripFiles = await tripDataFiles();
	const [usersFile, sharesFile, sessionsFile, editLocksFile, ...tripFiles] = await Promise.all([
		readJsonFile(usersDataPath),
		readJsonFile(sharesDataPath),
		readJsonFile(sessionsDataPath),
		readJsonFile(editLocksDataPath),
		...managedTripFiles.map(async (tripDataFile) => ({
			file: await readJsonFile(tripDataFile.path),
			slug: tripDataFile.slug
		}))
	]);
	const users = storedUsersFileSchema.parse(usersFile);
	const shares = storedSharesFileSchema.parse(sharesFile);
	const sessions = storedSessionsFileSchema.parse(sessionsFile);
	const editLocks = storedEditLocksFileSchema.parse(editLocksFile);
	const trips = tripFiles.map(({ file, slug }) => {
		const trip = storedTripFileSchema.parse(file).trip;
		return storedTripSchema.parse({ ...trip, slug });
	});

	return storedDataSchema.parse({
		version: storedDataVersion,
		users: users.users,
		trips,
		shares: shares.shares,
		sessions: sessions.sessions,
		editLocks: editLocks.editLocks
	});
}

async function readStoredData(): Promise<StoredData> {
	if (hasSplitData()) {
		return readSplitStoredData();
	}
	return defaultData();
}

async function clearPersistedEditLocksAtStartup(): Promise<void> {
	const data = await readStoredData();
	if (data.editLocks.length === 0) {
		return;
	}

	data.editLocks = [];
	await writeData(data);
}

async function readData(): Promise<StoredData> {
	startupLockCleanup ??= clearPersistedEditLocksAtStartup();
	await startupLockCleanup;
	return readStoredData();
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

function jsonSource(data: unknown): string {
	return `${JSON.stringify(data, null, jsonIndentation)}\n`;
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
	await writeDurableFile(filePath, jsonSource(data));
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

async function transaction<Result>(operation: (data: StoredData) => Promise<Result> | Result): Promise<Result> {
	let release: (() => void) | undefined;
	const nextTransaction = new Promise<void>((resolve) => {
		release = resolve;
	});
	const previousTransaction = transactionTail;
	transactionTail = nextTransaction;
	await previousTransaction;

	try {
		const data = await readData();
		purgeExpiredRecords(data);
		const result = await operation(data);
		await writeData(data);
		return result;
	} finally {
		release?.();
	}
}

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await derivePasswordKey(password, salt, 64);
	return `${salt.toString('hex')}.${key.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	const [saltHex, keyHex, ...remainder] = passwordHash.split('.');
	if (saltHex === undefined || keyHex === undefined || remainder.length > 0) {
		return false;
	}

	const salt = Buffer.from(saltHex, 'hex');
	const expectedKey = Buffer.from(keyHex, 'hex');
	if (salt.length === 0 || expectedKey.length === 0) {
		return false;
	}

	const actualKey = await derivePasswordKey(password, salt, expectedKey.length);
	return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
}

function purgeExpiredRecords(data: StoredData): void {
	data.sessions = data.sessions.filter((session) => !isExpired(session.expiresAt));
	data.editLocks = data.editLocks.filter((lock) => !isExpired(lock.expiresAt));
}

function findTripBySlug(data: StoredData, slug: string): StoredTrip | undefined {
	return data.trips.find((trip) => trip.slug === slug);
}

function slugBaseForTitle(title: string): string {
	const normalized = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return normalized || 'trip';
}

function uniqueTripSlug(trips: StoredTrip[], title: string): string {
	const base = slugBaseForTitle(title);
	const existingSlugs = new Set(trips.map((trip) => trip.slug));
	if (!existingSlugs.has(base)) {
		return base;
	}

	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!existingSlugs.has(candidate)) {
			return candidate;
		}
	}
}

function latestItemStartAt(itinerary: Itinerary): number | null {
	if (itinerary.items.length === 0) {
		return null;
	}
	return Math.max(...itinerary.items.map((item) => timingStartTimestamp(item.timing)));
}

function compareTripSwitchOptions(left: TripSwitchOption, right: TripSwitchOption): number {
	const leftLatestItemStartAt = left.latestItemStartAt;
	const rightLatestItemStartAt = right.latestItemStartAt;
	if (leftLatestItemStartAt === null && rightLatestItemStartAt !== null) {
		return -1;
	}
	if (leftLatestItemStartAt !== null && rightLatestItemStartAt === null) {
		return 1;
	}
	if (leftLatestItemStartAt === null && rightLatestItemStartAt === null) {
		return right.updatedAt - left.updatedAt || left.title.localeCompare(right.title);
	}
	if (leftLatestItemStartAt === null || rightLatestItemStartAt === null) {
		throw new Error('Trip switch options must consistently identify empty trips.');
	}
	return (
		rightLatestItemStartAt - leftLatestItemStartAt ||
		right.updatedAt - left.updatedAt ||
		left.title.localeCompare(right.title)
	);
}

function requireTripById(data: StoredData, tripId: string): StoredTrip {
	const trip = data.trips.find((candidate) => candidate.id === tripId);
	if (!trip) {
		throw new StoreError(404, 'Trip not found.');
	}
	return trip;
}

function getTripAccess(data: StoredData, trip: StoredTrip, user: AuthenticatedUser | null): TripAccessRole | null {
	if (user?.id === trip.ownerId) {
		return 'sudo';
	}

	if (user) {
		const share = data.shares.find((candidate) => candidate.tripId === trip.id && candidate.userId === user.id);
		if (share) {
			return share.role;
		}
	}

	return trip.isPublic ? 'visitor' : null;
}

function findItemIndex(itinerary: Itinerary, itemId: string): number {
	return itinerary.items.findIndex((item) => item.id === itemId);
}

function assertTripOwner(trip: StoredTrip, userId: string): void {
	if (trip.ownerId !== userId) {
		throw new StoreError(403, 'Only the trip owner can edit this trip.');
	}
}

export async function needsInitialSetup(): Promise<boolean> {
	const data = await readData();
	return data.users.length === 0;
}

export async function createInitialSudo(usernameInput: string, passwordInput: string): Promise<AuthenticatedUser> {
	const username = usernameSchema.parse(usernameInput);
	const password = passwordSchema.parse(passwordInput);
	const passwordHash = await hashPassword(password);

	return transaction((data) => {
		if (data.users.length > 0) {
			throw new StoreError(409, 'Initial setup has already been completed.');
		}

		const createdAt = timestamp();
		const user: z.infer<typeof storedUserSchema> = {
			id: randomUUID(),
			username,
			passwordHash,
			createdAt
		};
		data.users.push(user);
		for (const trip of data.trips) {
			if (trip.ownerId === null) {
				trip.ownerId = user.id;
				trip.updatedAt = createdAt;
			}
		}
		return { id: user.id, username: user.username };
	});
}

export async function authenticate(usernameInput: string, passwordInput: string): Promise<AuthenticatedUser | null> {
	const username = usernameSchema.safeParse(usernameInput);
	if (!username.success || typeof passwordInput !== 'string') {
		return null;
	}

	const data = await readData();
	const user = data.users.find((candidate) => candidate.username.toLowerCase() === username.data.toLowerCase());
	if (!user || !(await verifyPassword(passwordInput, user.passwordHash))) {
		return null;
	}

	return { id: user.id, username: user.username };
}

export async function createSession(userId: string): Promise<string> {
	return transaction((data) => {
		if (!data.users.some((user) => user.id === userId)) {
			throw new StoreError(401, 'The user account no longer exists.');
		}

		const session = {
			id: randomUUID(),
			userId,
			expiresAt: futureTimestamp(sessionLifetimeMilliseconds)
		};
		data.sessions.push(session);
		return session.id;
	});
}

export async function getSessionUser(sessionId: string | undefined): Promise<AuthenticatedUser | null> {
	if (!sessionId) {
		return null;
	}

	const data = await readData();
	const session = data.sessions.find((candidate) => candidate.id === sessionId && !isExpired(candidate.expiresAt));
	if (!session) {
		return null;
	}

	const user = data.users.find((candidate) => candidate.id === session.userId);
	return user ? { id: user.id, username: user.username } : null;
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
	if (!sessionId) {
		return;
	}

	await transaction((data) => {
		data.sessions = data.sessions.filter((session) => session.id !== sessionId);
	});
}

export async function getTripView(slug: string, user: AuthenticatedUser | null): Promise<TripView | null> {
	const data = await readData();
	const trip = findTripBySlug(data, slug);
	if (!trip) {
		return null;
	}

	const access = getTripAccess(data, trip, user);
	if (!access) {
		return null;
	}

	if (access === 'visitor') {
		return {
			access,
			canEdit: false,
			id: trip.id,
			isPublic: trip.isPublic,
			revision: trip.revision,
			slug: trip.slug,
			itinerary: projectPublicItinerary(trip.itinerary)
		};
	}

	return {
		access,
		canEdit: access === 'sudo',
		id: trip.id,
		isPublic: trip.isPublic,
		revision: trip.revision,
		slug: trip.slug,
		itinerary: projectDetailedItinerary(trip.itinerary, access)
	};
}

export async function createTrip(input: { details: unknown; ownerId: string }): Promise<TripReference> {
	const details = tripDetailsSchema.parse(input.details);

	return transaction((data) => {
		if (!data.users.some((user) => user.id === input.ownerId)) {
			throw new StoreError(401, 'The signed-in account no longer exists.');
		}

		const createdAt = timestamp();
		const trip: StoredTrip = {
			id: randomUUID(),
			slug: uniqueTripSlug(data.trips, details.title),
			ownerId: input.ownerId,
			isPublic: false,
			revision: 0,
			itinerary: { ...details, items: [] },
			createdAt,
			updatedAt: createdAt
		};
		data.trips.push(trip);
		return { id: trip.id, slug: trip.slug };
	});
}

export async function listTripSwitchOptions(userId: string): Promise<TripSwitchOption[]> {
	const data = await readData();
	const user = data.users.find((candidate) => candidate.id === userId);
	if (!user) {
		return [];
	}

	return data.trips
		.filter((trip) => getTripAccess(data, trip, user) !== null)
		.map((trip) => ({
			latestItemStartAt: latestItemStartAt(trip.itinerary),
			slug: trip.slug,
			title: trip.itinerary.title,
			updatedAt: trip.updatedAt
		}))
		.sort(compareTripSwitchOptions);
}

export async function assertTripOwnerAccess(input: { tripId: string; userId: string }): Promise<void> {
	const data = await readData();
	getTripForMutation(data, input.tripId, input.userId);
}

export async function listTripMembers(tripId: string, actorId: string): Promise<TripMember[]> {
	const data = await readData();
	const trip = requireTripById(data, tripId);
	assertTripOwner(trip, actorId);

	const members: TripMember[] = [];
	for (const user of data.users) {
		if (user.id === trip.ownerId) {
			members.push({ id: user.id, username: user.username, role: 'sudo' });
			continue;
		}

		const share = data.shares.find((candidate) => candidate.tripId === trip.id && candidate.userId === user.id);
		if (share) {
			members.push({ id: user.id, username: user.username, role: share.role });
		}
	}
	return members;
}

export async function hasActiveTripEditSession(input: { tripId: string; userId: string }): Promise<boolean> {
	const data = await readData();
	const trip = requireTripById(data, input.tripId);
	assertTripOwner(trip, input.userId);
	return data.editLocks.some((lock) => lock.tripId === trip.id && !isExpired(lock.expiresAt));
}

export async function createSharedUser(input: {
	actorId: string;
	password: string;
	role: ShareRole;
	tripId: string;
	username: string;
}): Promise<TripMember> {
	const username = usernameSchema.parse(input.username);
	const password = passwordSchema.parse(input.password);
	const role = shareRoleSchema.parse(input.role);
	const passwordHash = await hashPassword(password);

	return transaction((data) => {
		const trip = requireTripById(data, input.tripId);
		assertTripOwner(trip, input.actorId);
		if (data.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
			throw new StoreError(409, 'That username is already in use.');
		}

		const user = {
			id: randomUUID(),
			username,
			passwordHash,
			createdAt: timestamp()
		};
		data.users.push(user);
		data.shares.push({ tripId: trip.id, userId: user.id, role });
		return { id: user.id, username: user.username, role };
	});
}

export async function setTripPublic(input: { actorId: string; isPublic: boolean; tripId: string }): Promise<void> {
	await transaction((data) => {
		const trip = requireTripById(data, input.tripId);
		assertTripOwner(trip, input.actorId);
		trip.isPublic = input.isPublic;
		trip.updatedAt = timestamp();
	});
}

function getTripForMutation(data: StoredData, tripId: string, userId: string): StoredTrip {
	const trip = requireTripById(data, tripId);
	assertTripOwner(trip, userId);
	return trip;
}

export async function saveTripDetails(input: {
	details: unknown;
	revision: number;
	tripId: string;
	userId: string;
}): Promise<{ revision: number }> {
	const details: TripDetails = tripDetailsSchema.parse(input.details);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		return commitItineraryChange(trip, { ...trip.itinerary, ...details });
	});
}

function assertExpectedRevision(trip: StoredTrip, revision: number): void {
	if (trip.revision !== revision) {
		throw new StoreError(409, 'This trip changed before your edit could be saved. Reload and try again.');
	}
}

function assertNoActiveEditLock(data: StoredData, trip: StoredTrip): void {
	if (data.editLocks.some((lock) => lock.tripId === trip.id)) {
		throw new StoreError(423, 'This trip is currently being edited.');
	}
}

function findActiveLock(
	data: StoredData,
	input: { lockToken: string; targetId: string; tripId: string; userId: string }
): StoredEditLock | undefined {
	return data.editLocks.find(
		(candidate) =>
			candidate.tripId === input.tripId &&
			candidate.targetId === input.targetId &&
			candidate.ownerId === input.userId &&
			candidate.token === input.lockToken
	);
}

function assertActiveLock(
	data: StoredData,
	input: { lockToken: string; targetId: string; tripId: string; userId: string }
): StoredEditLock {
	const lock = findActiveLock(data, input);
	if (!lock) {
		throw new StoreError(423, 'The edit lock is no longer active.');
	}
	return lock;
}

function commitItineraryChange(trip: StoredTrip, itinerary: Itinerary): { revision: number } {
	trip.itinerary = itinerarySchema.parse(itinerary);
	trip.revision += 1;
	trip.updatedAt = timestamp();
	return { revision: trip.revision };
}

async function acquireTripLock(input: {
	itemId?: string;
	targetId: string;
	tripId: string;
	userId: string;
}): Promise<EditLock> {
	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		if (input.itemId && findItemIndex(trip.itinerary, input.itemId) < 0) {
			throw new StoreError(404, 'Itinerary item not found.');
		}
		assertNoActiveEditLock(data, trip);

		const lock: StoredEditLock = {
			tripId: trip.id,
			targetId: input.targetId,
			ownerId: input.userId,
			token: randomUUID(),
			acquiredAt: timestamp(),
			expiresAt: futureTimestamp(editLockLifetimeMilliseconds),
			revisionAtStart: trip.revision
		};
		data.editLocks.push(lock);
		return { token: lock.token, expiresAt: lock.expiresAt, revisionAtStart: lock.revisionAtStart };
	});
}

async function releaseTripLock(input: {
	lockToken: string;
	targetId: string;
	tripId: string;
	userId: string;
}): Promise<void> {
	await transaction((data) => {
		const lock = assertActiveLock(data, input);
		data.editLocks = data.editLocks.filter((candidate) => candidate.token !== lock.token);
	});
}

async function renewTripLock(input: {
	lockToken: string;
	targetId: string;
	tripId: string;
	userId: string;
}): Promise<EditLock> {
	return transaction((data) => {
		const lock = assertActiveLock(data, input);
		lock.expiresAt = futureTimestamp(editLockLifetimeMilliseconds);
		return { token: lock.token, expiresAt: lock.expiresAt, revisionAtStart: lock.revisionAtStart };
	});
}

export async function acquireItemLock(input: { itemId: string; tripId: string; userId: string }): Promise<EditLock> {
	return acquireTripLock({ ...input, targetId: input.itemId });
}

export async function acquireTripStructureLock(input: { tripId: string; userId: string }): Promise<EditLock> {
	return acquireTripLock({ ...input, targetId: tripStructureLockTargetId });
}

export async function releaseItemLock(input: {
	itemId: string;
	lockToken: string;
	tripId: string;
	userId: string;
}): Promise<void> {
	return releaseTripLock({ ...input, targetId: input.itemId });
}

export async function releaseTripStructureLock(input: {
	lockToken: string;
	tripId: string;
	userId: string;
}): Promise<void> {
	return releaseTripLock({ ...input, targetId: tripStructureLockTargetId });
}

export async function renewItemLock(input: {
	itemId: string;
	lockToken: string;
	tripId: string;
	userId: string;
}): Promise<EditLock> {
	return renewTripLock({ ...input, targetId: input.itemId });
}

export async function renewTripStructureLock(input: {
	lockToken: string;
	tripId: string;
	userId: string;
}): Promise<EditLock> {
	return renewTripLock({ ...input, targetId: tripStructureLockTargetId });
}

export async function forceReleaseTripEditLocks(input: {
	tripId: string;
	userId: string;
}): Promise<{ released: number }> {
	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		const released = data.editLocks.filter((lock) => lock.tripId === trip.id).length;
		data.editLocks = data.editLocks.filter((lock) => lock.tripId !== trip.id);
		return { released };
	});
}

export async function saveItem(input: {
	item: unknown;
	itemId: string;
	lockToken: string;
	revision: number;
	tripId: string;
	userId: string;
}): Promise<{ revision: number }> {
	const item = itineraryItemSchema.parse(input.item);
	if (item.id !== input.itemId) {
		throw new StoreError(400, 'An item ID cannot be changed while editing.');
	}

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		const lock = assertActiveLock(data, { ...input, targetId: input.itemId });
		const itemIndex = findItemIndex(trip.itinerary, input.itemId);
		if (itemIndex < 0) {
			throw new StoreError(404, 'Itinerary item not found.');
		}
		const items = trip.itinerary.items.map((existingItem, index) => (index === itemIndex ? item : existingItem));
		const result = commitItineraryChange(trip, { ...trip.itinerary, items });
		data.editLocks = data.editLocks.filter((candidate) => candidate.token !== lock.token);
		return result;
	});
}

export async function createItem(input: {
	item: unknown;
	lockToken: string;
	revision: number;
	tripId: string;
	userId: string;
}): Promise<{ revision: number }> {
	const item = itineraryItemSchema.parse(input.item);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		const lock = assertActiveLock(data, { ...input, targetId: tripStructureLockTargetId });
		if (findItemIndex(trip.itinerary, item.id) >= 0) {
			throw new StoreError(409, 'An itinerary item already uses this ID.');
		}
		const result = commitItineraryChange(trip, {
			...trip.itinerary,
			items: [...trip.itinerary.items, item]
		});
		data.editLocks = data.editLocks.filter((candidate) => candidate.token !== lock.token);
		return result;
	});
}

export async function deleteItem(input: {
	itemId: string;
	revision: number;
	tripId: string;
	userId: string;
}): Promise<{ revision: number }> {
	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		const itemIndex = findItemIndex(trip.itinerary, input.itemId);
		if (itemIndex < 0) {
			throw new StoreError(404, 'Itinerary item not found.');
		}
		return commitItineraryChange(trip, {
			...trip.itinerary,
			items: trip.itinerary.items.filter((_, index) => index !== itemIndex)
		});
	});
}
