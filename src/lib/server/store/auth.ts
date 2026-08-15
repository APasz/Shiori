import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { StoreError } from './error';
import { passwordSchema, storedUserSchema, usernameSchema, type AuthenticatedUser } from './model';
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

		const createdAt = timestamp();
		const user = storedUserSchema.parse({
			id: randomUUID(),
			username,
			passwordHash,
			createdAt
		});
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

export async function prepareNewAccount(input: {
	password: string;
	username: string;
}): Promise<{ passwordHash: string; username: string }> {
	const username = usernameSchema.parse(input.username);
	const password = passwordSchema.parse(input.password);
	return { passwordHash: await hashPassword(password), username };
}
