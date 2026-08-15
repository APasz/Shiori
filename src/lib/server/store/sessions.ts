import { randomUUID } from 'node:crypto';
import { StoreError } from './error';
import type { AuthenticatedUser } from './model';
import { readData, transaction } from './persistence';
import { futureTimestamp, isExpired } from './time';

const sessionLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;

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
