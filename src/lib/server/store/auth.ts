import { randomUUID } from 'node:crypto';
import { defaultFormatPreferences, type FormatPreferences } from '$lib/format-preferences';
import { defaultColourway, colourwaySchema, type Colourway } from '$lib/theme/colourway';
import { StoreError } from './error';
import {
	formatPreferencesSchema,
	passwordSchema,
	storedUserSchema,
	usernameIdentityKey,
	usernameSchema,
	type AccountManagementEntry,
	type AuthenticatedUser,
	type StoredData,
	type StoredUser
} from './model';
import { hashPassword, preparePasswordHash, verifyPassword } from './password';
import { readData, transaction } from './persistence';
import { timestamp } from './time';

export { preparePasswordHash };

function newStoredUser(account: { isSudo: boolean; passwordHash: string; username: string }): StoredUser {
	return storedUserSchema.parse({
		colourway: defaultColourway,
		formatPreferences: { ...defaultFormatPreferences },
		id: randomUUID(),
		isSudo: account.isSudo,
		username: account.username,
		passwordHash: account.passwordHash,
		createdAt: timestamp()
	});
}

function authenticatedUser(user: StoredUser): AuthenticatedUser {
	return { id: user.id, username: user.username };
}

function accountForId(data: StoredData, userId: string): StoredUser {
	const user = data.users.find((candidate) => candidate.id === userId);
	if (!user) {
		throw new StoreError(404, 'Account not found.');
	}
	return user;
}

function assertUsernameIsAvailable(data: StoredData, username: string, excludedUserId?: string): void {
	if (
		data.users.some(
			(user) => user.id !== excludedUserId && usernameIdentityKey(user.username) === usernameIdentityKey(username)
		)
	) {
		throw new StoreError(409, 'That username is already in use.');
	}
}

export function isSudo(data: StoredData, userId: string): boolean {
	return data.users.some((user) => user.id === userId && user.isSudo);
}

export function assertSudo(data: StoredData, actorId: string): void {
	if (!isSudo(data, actorId)) {
		throw new StoreError(403, 'Only the sudo user can perform this action.');
	}
}

export async function isSudoUser(userId: string): Promise<boolean> {
	return isSudo(await readData(), userId);
}

export async function needsInitialSetup(): Promise<boolean> {
	const data = await readData();
	return data.users.length === 0;
}

export async function createInitialSudo(usernameInput: string, passwordInput: string): Promise<AuthenticatedUser> {
	const username = usernameSchema.parse(usernameInput);
	const passwordHash = await preparePasswordHash(passwordInput);

	return transaction(
		(data) => {
			if (data.users.length > 0) {
				throw new StoreError(409, 'Initial setup has already been completed.');
			}

			const user = newStoredUser({ isSudo: true, passwordHash, username });
			data.users.push(user);
			for (const trip of data.trips) {
				if (trip.ownerId === null) {
					trip.ownerId = user.id;
					trip.updatedAt = user.createdAt;
				}
			}
			return authenticatedUser(user);
		},
		{ global: ['users'], tripIds: 'all' }
	);
}

export async function createAccount(input: {
	actorId: string;
	password: string;
	username: string;
}): Promise<AuthenticatedUser> {
	const account = await prepareNewAccount(input);

	return transaction(
		(data) => {
			assertSudo(data, input.actorId);
			assertUsernameIsAvailable(data, account.username);

			const user = newStoredUser({ ...account, isSudo: false });
			data.users.push(user);
			return authenticatedUser(user);
		},
		{ global: ['users'], tripIds: [] }
	);
}

export async function updateOwnUsername(input: { userId: string; username: string }): Promise<AuthenticatedUser> {
	const username = usernameSchema.parse(input.username);

	return transaction(
		(data) => {
			const user = accountForId(data, input.userId);
			assertUsernameIsAvailable(data, username, user.id);
			user.username = username;
			return authenticatedUser(user);
		},
		{ global: ['users'], tripIds: [] }
	);
}

export async function updateOwnColourway(input: { colourway: unknown; userId: string }): Promise<Colourway> {
	const colourway = colourwaySchema.parse(input.colourway);

	return transaction(
		(data) => {
			const user = accountForId(data, input.userId);
			user.colourway = colourway;
			return user.colourway;
		},
		{ global: ['users'], tripIds: [] }
	);
}

export async function updateOwnFormatPreferences(input: {
	dateFormat: unknown;
	timeFormat: unknown;
	userId: string;
}): Promise<FormatPreferences> {
	const formatPreferences = formatPreferencesSchema.parse({
		dateFormat: input.dateFormat,
		timeFormat: input.timeFormat
	});

	return transaction(
		(data) => {
			const user = accountForId(data, input.userId);
			user.formatPreferences = formatPreferences;
			return user.formatPreferences;
		},
		{ global: ['users'], tripIds: [] }
	);
}

/** Changes an account password after verifying the current password and revokes every active session. */
export async function changeOwnPassword(input: {
	currentPassword: string;
	newPassword: string;
	userId: string;
}): Promise<void> {
	const newPassword = passwordSchema.parse(input.newPassword);
	const snapshot = await readData();
	const account = accountForId(snapshot, input.userId);
	if (!(await verifyPassword(input.currentPassword, account.passwordHash))) {
		throw new StoreError(400, 'Your current password is incorrect.');
	}
	const passwordHash = await hashPassword(newPassword);

	return transaction(
		(data) => {
			const user = accountForId(data, input.userId);
			if (user.passwordHash !== account.passwordHash) {
				throw new StoreError(
					409,
					'Your password changed in another session. Enter your current password and try again.'
				);
			}

			user.passwordHash = passwordHash;
			data.sessions = data.sessions.filter((session) => session.userId !== user.id);
		},
		{ global: ['users', 'sessions'], tripIds: [] }
	);
}

export async function listAccounts(actorId: string): Promise<AuthenticatedUser[]> {
	const data = await readData();
	assertSudo(data, actorId);
	return data.users.map(authenticatedUser).sort((left, right) => left.username.localeCompare(right.username));
}

export async function listAccountsForManagement(actorId: string): Promise<AccountManagementEntry[]> {
	const data = await readData();
	assertSudo(data, actorId);
	const ownerIds = new Set(data.trips.map((trip) => trip.ownerId));
	return data.users
		.map((user) => ({ ...authenticatedUser(user), ownsTrip: ownerIds.has(user.id) }))
		.sort((left, right) => left.username.localeCompare(right.username));
}

export async function resetAccountPassword(input: {
	actorId: string;
	password: string;
	userId: string;
}): Promise<void> {
	const passwordHash = await preparePasswordHash(input.password);

	return transaction(
		(data) => {
			assertSudo(data, input.actorId);
			const user = accountForId(data, input.userId);
			if (user.isSudo) {
				throw new StoreError(409, 'Reset the sudo account password through the server recovery procedure.');
			}
			user.passwordHash = passwordHash;
			data.sessions = data.sessions.filter((session) => session.userId !== user.id);
		},
		{ global: ['users', 'sessions'], tripIds: [] }
	);
}

export async function deleteAccount(input: { actorId: string; userId: string }): Promise<void> {
	return transaction(
		(data) => {
			assertSudo(data, input.actorId);
			const user = accountForId(data, input.userId);
			if (user.isSudo) {
				throw new StoreError(409, 'The sudo account cannot be deleted.');
			}
			if (data.trips.some((trip) => trip.ownerId === user.id)) {
				throw new StoreError(409, 'Trip owners cannot be deleted.');
			}

			data.users = data.users.filter((candidate) => candidate.id !== user.id);
			data.shares = data.shares.filter((share) => share.userId !== user.id);
			data.sessions = data.sessions.filter((session) => session.userId !== user.id);
			data.editLocks = data.editLocks.filter((lock) => lock.ownerId !== user.id);
		},
		{ global: ['users', 'shares', 'sessions', 'editLocks'], tripIds: [] }
	);
}

export async function authenticate(usernameInput: string, passwordInput: string): Promise<AuthenticatedUser | null> {
	const username = usernameSchema.safeParse(usernameInput);
	if (!username.success || typeof passwordInput !== 'string') {
		return null;
	}

	const data = await readData();
	const user = data.users.find(
		(candidate) => usernameIdentityKey(candidate.username) === usernameIdentityKey(username.data)
	);
	if (!user || !(await verifyPassword(passwordInput, user.passwordHash))) {
		return null;
	}

	return authenticatedUser(user);
}

export async function prepareNewAccount(input: {
	password: string;
	username: string;
}): Promise<{ passwordHash: string; username: string }> {
	const username = usernameSchema.parse(input.username);
	return { passwordHash: await preparePasswordHash(input.password), username };
}
