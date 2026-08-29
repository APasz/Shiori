import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { isPasswordHash, passwordHashKeyBytes, passwordHashSaltBytes, passwordSchema } from './model';

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

/** Hashes a password that has already passed the shared password policy. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(passwordHashSaltBytes);
	const key = await derivePasswordKey(password, salt, passwordHashKeyBytes);
	return `${salt.toString('hex')}.${key.toString('hex')}`;
}

export async function preparePasswordHash(passwordInput: string): Promise<string> {
	return hashPassword(passwordSchema.parse(passwordInput));
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	if (!isPasswordHash(passwordHash)) {
		return false;
	}

	const [saltHex, keyHex] = passwordHash.split('.');
	if (saltHex === undefined || keyHex === undefined) {
		return false;
	}

	const salt = Buffer.from(saltHex, 'hex');
	const expectedKey = Buffer.from(keyHex, 'hex');
	const actualKey = await derivePasswordKey(password, salt, passwordHashKeyBytes);
	return timingSafeEqual(actualKey, expectedKey);
}
