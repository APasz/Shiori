import { StoreError } from './error';
import {
	shareRoleSchema,
	usernameSchema,
	type AuthenticatedUser,
	type ShareRole,
	type StoredData,
	type StoredTrip
} from './model';
import { readData, transaction } from './persistence';
import { timestamp } from './time';
import { assertTripOwner, requireTripById } from './trips';
import type { TripMember } from './views';

function requireOwnerTrip(data: StoredData, tripId: string, actorId: string): StoredTrip {
	const trip = requireTripById(data, tripId);
	assertTripOwner(trip, actorId);
	return trip;
}

function requireSharedMember(data: StoredData, trip: StoredTrip, userId: string): void {
	if (!data.shares.some((share) => share.tripId === trip.id && share.userId === userId)) {
		throw new StoreError(404, 'That person does not have access to this trip.');
	}
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

export async function listAvailableTripAccounts(tripId: string, actorId: string): Promise<AuthenticatedUser[]> {
	const data = await readData();
	const trip = requireTripById(data, tripId);
	assertTripOwner(trip, actorId);
	const memberIds = new Set(data.shares.filter((share) => share.tripId === trip.id).map((share) => share.userId));
	if (trip.ownerId) {
		memberIds.add(trip.ownerId);
	}

	return data.users
		.filter((user) => !memberIds.has(user.id))
		.map(({ id, username }) => ({ id, username }))
		.sort((left, right) => left.username.localeCompare(right.username));
}

export async function grantTripAccess(input: {
	actorId: string;
	role: ShareRole;
	tripId: string;
	username: string;
}): Promise<TripMember> {
	const username = usernameSchema.parse(input.username);
	const role = shareRoleSchema.parse(input.role);

	return transaction((data) => {
		const trip = requireOwnerTrip(data, input.tripId, input.actorId);
		const user = data.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
		if (!user) {
			throw new StoreError(404, 'No account was found for that username.');
		}
		if (user.id === trip.ownerId) {
			throw new StoreError(409, 'The trip owner already has access.');
		}
		if (data.shares.some((share) => share.tripId === trip.id && share.userId === user.id)) {
			throw new StoreError(409, 'That person already has access to this trip.');
		}

		data.shares.push({ tripId: trip.id, userId: user.id, role });
		return { id: user.id, username: user.username, role };
	});
}

export async function setSharedUserRole(input: {
	actorId: string;
	role: ShareRole;
	tripId: string;
	userId: string;
}): Promise<void> {
	const role = shareRoleSchema.parse(input.role);

	return transaction((data) => {
		const trip = requireOwnerTrip(data, input.tripId, input.actorId);
		requireSharedMember(data, trip, input.userId);
		const share = data.shares.find((candidate) => candidate.tripId === trip.id && candidate.userId === input.userId);
		if (!share) {
			throw new Error('A shared member disappeared before their role could be updated.');
		}
		share.role = role;
	});
}

export async function setTripMemberAccess(input: {
	actorId: string;
	role: ShareRole | null;
	tripId: string;
	userId: string;
}): Promise<void> {
	return transaction((data) => {
		const trip = requireOwnerTrip(data, input.tripId, input.actorId);
		const user = data.users.find((candidate) => candidate.id === input.userId);
		if (!user) {
			throw new StoreError(404, 'Account not found.');
		}
		if (user.id === trip.ownerId) {
			throw new StoreError(403, 'The trip owner’s access cannot be changed.');
		}

		const shareIndex = data.shares.findIndex((share) => share.tripId === trip.id && share.userId === input.userId);
		if (input.role === null) {
			if (shareIndex === -1) {
				return;
			}
			data.shares.splice(shareIndex, 1);
			return;
		}

		const role = shareRoleSchema.parse(input.role);
		const share = data.shares[shareIndex];
		if (share) {
			share.role = role;
			return;
		}
		data.shares.push({ role, tripId: trip.id, userId: user.id });
	});
}

export async function removeTripAccess(input: { actorId: string; tripId: string; userId: string }): Promise<void> {
	return transaction((data) => {
		const trip = requireOwnerTrip(data, input.tripId, input.actorId);
		requireSharedMember(data, trip, input.userId);
		data.shares = data.shares.filter((share) => share.tripId !== trip.id || share.userId !== input.userId);
	});
}

export async function setTripPublic(input: { actorId: string; isPublic: boolean; tripId: string }): Promise<void> {
	await transaction((data) => {
		const trip = requireOwnerTrip(data, input.tripId, input.actorId);
		trip.isPublic = input.isPublic;
		trip.updatedAt = timestamp();
	});
}
