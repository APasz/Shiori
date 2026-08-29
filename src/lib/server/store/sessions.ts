import { randomUUID } from 'node:crypto';
import { isSessionRefreshDue, sessionLifetimeMilliseconds } from '../session';
import { assertSudo } from './auth';
import { StoreError } from './error';
import type { AuthenticatedSessionUser, AuthenticatedUser, StoredUser } from './model';
import { readData, sessionTransaction, transaction } from './persistence';
import { futureTimestamp, isExpired } from './time';

export type SessionRefresh = {
	renewed: boolean;
	user: AuthenticatedSessionUser;
};

export type ActiveSessionUser = AuthenticatedUser & {
	lastSeenAt: number;
};

function authenticatedSessionUser(user: StoredUser): AuthenticatedSessionUser {
	return {
		colourway: user.colourway,
		formatPreferences: user.formatPreferences,
		id: user.id,
		username: user.username
	};
}

export async function createSession(userId: string): Promise<string> {
	return transaction(
		(data) => {
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
		},
		{ global: ['sessions'], tripIds: [] }
	);
}

/** Validates an active session and renews its idle timeout at the configured cadence. */
export async function refreshSession(sessionId: string | undefined): Promise<SessionRefresh | null> {
	if (!sessionId) {
		return null;
	}

	return sessionTransaction<SessionRefresh | null>((data) => {
		const session = data.sessions.find((candidate) => candidate.id === sessionId && !isExpired(candidate.expiresAt));
		if (!session) {
			return { changed: false, value: null };
		}

		const user = data.users.find((candidate) => candidate.id === session.userId);
		if (!user) {
			return { changed: false, value: null };
		}

		if (!isSessionRefreshDue(session.expiresAt)) {
			return { changed: false, value: { renewed: false, user: authenticatedSessionUser(user) } };
		}

		session.expiresAt = futureTimestamp(sessionLifetimeMilliseconds);
		return { changed: true, value: { renewed: true, user: authenticatedSessionUser(user) } };
	});
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
	if (!sessionId) {
		return;
	}

	await transaction(
		(data) => {
			data.sessions = data.sessions.filter((session) => session.id !== sessionId);
		},
		{ global: ['sessions'], tripIds: [] }
	);
}

export async function forceLogoutAllUsers(userId: string): Promise<{ loggedOut: number }> {
	return transaction(
		(data) => {
			assertSudo(data, userId);
			const loggedOut = new Set(data.sessions.map((session) => session.userId)).size;
			data.sessions = [];
			return { loggedOut };
		},
		{ global: ['sessions'], tripIds: [] }
	);
}

/** Lists signed-in users with the timestamp from their most recently renewed session. */
export async function listActiveSessionUsers(actorId: string): Promise<ActiveSessionUser[]> {
	const data = await readData();
	assertSudo(data, actorId);
	const lastSeenByUserId = new Map<string, number>();
	for (const session of data.sessions) {
		if (isExpired(session.expiresAt)) {
			continue;
		}
		const lastSeenAt = session.expiresAt - sessionLifetimeMilliseconds;
		const previousLastSeenAt = lastSeenByUserId.get(session.userId);
		if (previousLastSeenAt === undefined || lastSeenAt > previousLastSeenAt) {
			lastSeenByUserId.set(session.userId, lastSeenAt);
		}
	}

	return data.users
		.flatMap((user) => {
			const lastSeenAt = lastSeenByUserId.get(user.id);
			return lastSeenAt === undefined ? [] : [{ id: user.id, username: user.username, lastSeenAt }];
		})
		.sort((left, right) => right.lastSeenAt - left.lastSeenAt || left.username.localeCompare(right.username));
}
