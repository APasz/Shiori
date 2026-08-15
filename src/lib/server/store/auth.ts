import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { StoreError } from './error';
import {
	passwordSchema,
	storedUserSchema,
	usernameSchema,
	type AccountManagementEntry,
	type AuthenticatedUser,
	type StoredData,
	type StoredUser
} from './model';
import { readData, transaction } from './persistence';
import { timestamp } from './time';

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

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await derivePasswordKey(password, salt, 64);
	return `${salt.toString('hex')}.${key.toString('hex')}`;
}

function newStoredUser(account: { passwordHash: string; username: string }): StoredUser {
	return storedUserSchema.parse({
		id: randomUUID(),
		username: account.username,
		passwordHash: account.passwordHash,
		createdAt: timestamp()
	});
}

function assertAccountManager(data: StoredData, actorId: string): void {
	if (!data.trips.some((trip) => trip.ownerId === actorId)) {
		throw new StoreError(403, 'Only a sudo owner can manage accounts.');
	}
}

export async function preparePasswordHash(passwordInput: string): Promise<string> {
	const password = passwordSchema.parse(passwordInput);
	return hashPassword(password);
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

		const user = newStoredUser({ passwordHash, username });
		data.users.push(user);
		for (const trip of data.trips) {
			if (trip.ownerId === null) {
				trip.ownerId = user.id;
				trip.updatedAt = user.createdAt;
			}
		}
		return { id: user.id, username: user.username };
	});
}

export async function createAccount(input: {
	actorId: string;
	password: string;
	username: string;
}): Promise<AuthenticatedUser> {
	const account = await prepareNewAccount(input);

	return transaction((data) => {
		assertAccountManager(data, input.actorId);
		if (data.users.some((user) => user.username.toLowerCase() === account.username.toLowerCase())) {
			throw new StoreError(409, 'That username is already in use.');
		}

		const user = newStoredUser(account);
		data.users.push(user);
		return { id: user.id, username: user.username };
	});
}

export async function listAccounts(actorId: string): Promise<AuthenticatedUser[]> {
	const data = await readData();
	assertAccountManager(data, actorId);
	return data.users
		.map(({ id, username }) => ({ id, username }))
		.sort((left, right) => left.username.localeCompare(right.username));
}

export async function listAccountsForManagement(actorId: string): Promise<AccountManagementEntry[]> {
	const data = await readData();
	assertAccountManager(data, actorId);
	const ownerIds = new Set(data.trips.map((trip) => trip.ownerId));
	return data.users
		.map(({ id, username }) => ({ id, ownsTrip: ownerIds.has(id), username }))
		.sort((left, right) => left.username.localeCompare(right.username));
}

export async function resetAccountPassword(input: {
	actorId: string;
	password: string;
	userId: string;
}): Promise<void> {
	const passwordHash = await preparePasswordHash(input.password);

	return transaction((data) => {
		assertAccountManager(data, input.actorId);
		const user = data.users.find((candidate) => candidate.id === input.userId);
		if (!user) {
			throw new StoreError(404, 'Account not found.');
		}
		user.passwordHash = passwordHash;
		data.sessions = data.sessions.filter((session) => session.userId !== user.id);
	});
}

export async function deleteAccount(input: { actorId: string; userId: string }): Promise<void> {
	return transaction((data) => {
		assertAccountManager(data, input.actorId);
		const user = data.users.find((candidate) => candidate.id === input.userId);
		if (!user) {
			throw new StoreError(404, 'Account not found.');
		}
		if (data.trips.some((trip) => trip.ownerId === user.id)) {
			throw new StoreError(409, 'Trip owners cannot be deleted.');
		}

		data.users = data.users.filter((candidate) => candidate.id !== user.id);
		data.shares = data.shares.filter((share) => share.userId !== user.id);
		data.sessions = data.sessions.filter((session) => session.userId !== user.id);
		data.editLocks = data.editLocks.filter((lock) => lock.ownerId !== user.id);
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

export async function prepareNewAccount(input: {
	password: string;
	username: string;
}): Promise<{ passwordHash: string; username: string }> {
	const username = usernameSchema.parse(input.username);
	return { passwordHash: await preparePasswordHash(input.password), username };
}
