import { randomUUID } from 'node:crypto';
import { assertAccountManager } from './auth';
import { StoreError } from './error';
import { tripStructureLockTargetId, type StoredData, type StoredEditLock } from './model';
import { readData, transaction } from './persistence';
import { futureTimestamp, isExpired, timestamp } from './time';
import { assertNoActiveEditLock, assertTripOwner, findItemIndex, getTripForMutation, requireTripById } from './trips';
import type { EditLock } from './views';

const editLockLifetimeMilliseconds = 10 * 60 * 1000;

type LockIdentity = {
	lockToken: string;
	targetId: string;
	tripId: string;
	userId: string;
};

function findActiveLock(data: StoredData, input: LockIdentity): StoredEditLock | undefined {
	return data.editLocks.find(
		(candidate) =>
			candidate.tripId === input.tripId &&
			candidate.targetId === input.targetId &&
			candidate.ownerId === input.userId &&
			candidate.token === input.lockToken
	);
}

export function assertActiveLock(data: StoredData, input: LockIdentity): StoredEditLock {
	const lock = findActiveLock(data, input);
	if (!lock) {
		throw new StoreError(423, 'The edit lock is no longer active.');
	}
	return lock;
}

function editLockView(lock: StoredEditLock): EditLock {
	return { token: lock.token, expiresAt: lock.expiresAt, revisionAtStart: lock.revisionAtStart };
}

async function acquireTripLock(input: {
	itemId?: string;
	targetId: string;
	tripId: string;
	userId: string;
}): Promise<EditLock> {
	return transaction(
		(data) => {
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
			return editLockView(lock);
		},
		{ global: ['editLocks'], tripIds: [] }
	);
}

async function releaseTripLock(input: LockIdentity): Promise<void> {
	await transaction(
		(data) => {
			const lock = assertActiveLock(data, input);
			data.editLocks = data.editLocks.filter((candidate) => candidate.token !== lock.token);
		},
		{ global: ['editLocks'], tripIds: [] }
	);
}

async function renewTripLock(input: LockIdentity): Promise<EditLock> {
	return transaction(
		(data) => {
			const lock = assertActiveLock(data, input);
			lock.expiresAt = futureTimestamp(editLockLifetimeMilliseconds);
			return editLockView(lock);
		},
		{ global: ['editLocks'], tripIds: [] }
	);
}

export async function acquireItemLock(input: { itemId: string; tripId: string; userId: string }): Promise<EditLock> {
	return acquireTripLock({ ...input, targetId: input.itemId });
}

export async function acquireTripStructureLock(input: { tripId: string; userId: string }): Promise<EditLock> {
	return acquireTripLock({ ...input, targetId: tripStructureLockTargetId });
}

export async function releaseItemLock(input: Omit<LockIdentity, 'targetId'> & { itemId: string }): Promise<void> {
	return releaseTripLock({ ...input, targetId: input.itemId });
}

export async function releaseTripStructureLock(input: Omit<LockIdentity, 'targetId'>): Promise<void> {
	return releaseTripLock({ ...input, targetId: tripStructureLockTargetId });
}

export async function renewItemLock(input: Omit<LockIdentity, 'targetId'> & { itemId: string }): Promise<EditLock> {
	return renewTripLock({ ...input, targetId: input.itemId });
}

export async function renewTripStructureLock(input: Omit<LockIdentity, 'targetId'>): Promise<EditLock> {
	return renewTripLock({ ...input, targetId: tripStructureLockTargetId });
}

export async function hasActiveTripEditSession(input: { tripId: string; userId: string }): Promise<boolean> {
	const data = await readData();
	const trip = requireTripById(data, input.tripId);
	assertTripOwner(trip, input.userId);
	return data.editLocks.some((lock) => lock.tripId === trip.id && !isExpired(lock.expiresAt));
}

export async function hasActiveEditSessions(userId: string): Promise<boolean> {
	const data = await readData();
	assertAccountManager(data, userId);
	return data.editLocks.some((lock) => !isExpired(lock.expiresAt));
}

export async function forceReleaseTripEditLocks(input: {
	tripId: string;
	userId: string;
}): Promise<{ released: number }> {
	return transaction(
		(data) => {
			const trip = getTripForMutation(data, input.tripId, input.userId);
			const released = data.editLocks.filter((lock) => lock.tripId === trip.id).length;
			data.editLocks = data.editLocks.filter((lock) => lock.tripId !== trip.id);
			return { released };
		},
		{ global: ['editLocks'], tripIds: [] }
	);
}

export async function forceReleaseAllEditLocks(userId: string): Promise<{ released: number }> {
	return transaction(
		(data) => {
			assertAccountManager(data, userId);
			const released = data.editLocks.length;
			data.editLocks = [];
			return { released };
		},
		{ global: ['editLocks'], tripIds: [] }
	);
}
