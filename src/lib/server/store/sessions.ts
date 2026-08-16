import { randomUUID } from 'node:crypto';
import { sessionLifetimeMilliseconds } from '../session';
import { StoreError } from './error';
import type { AuthenticatedUser } from './model';
import { sessionTransaction, transaction } from './persistence';
import { futureTimestamp, isExpired } from './time';

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

/** Validates an active session and restarts its seven-day idle timeout. */
export async function refreshSession(sessionId: string | undefined): Promise<AuthenticatedUser | null> {
	if (!sessionId) {
		return null;
	}

	return sessionTransaction((data) => {
		const session = data.sessions.find((candidate) => candidate.id === sessionId && !isExpired(candidate.expiresAt));
		if (!session) {
			return null;
		}

		const user = data.users.find((candidate) => candidate.id === session.userId);
		if (!user) {
			return null;
		}

		session.expiresAt = futureTimestamp(sessionLifetimeMilliseconds);
		return { id: user.id, username: user.username };
	});
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
	if (!sessionId) {
		return;
	}

	await transaction((data) => {
		data.sessions = data.sessions.filter((session) => session.id !== sessionId);
	});
}
