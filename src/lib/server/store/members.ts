import { randomUUID } from 'node:crypto';
import { prepareNewAccount } from './auth';
import { StoreError } from './error';
import { shareRoleSchema, storedUserSchema, type ShareRole } from './model';
import { readData, transaction } from './persistence';
import { timestamp } from './time';
import { assertTripOwner, requireTripById } from './trips';
import type { TripMember } from './views';

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

export async function createSharedUser(input: {
	actorId: string;
	password: string;
	role: ShareRole;
	tripId: string;
	username: string;
}): Promise<TripMember> {
	const account = await prepareNewAccount(input);
	const role = shareRoleSchema.parse(input.role);

	return transaction((data) => {
		const trip = requireTripById(data, input.tripId);
		assertTripOwner(trip, input.actorId);
		if (data.users.some((user) => user.username.toLowerCase() === account.username.toLowerCase())) {
			throw new StoreError(409, 'That username is already in use.');
		}

		const user = storedUserSchema.parse({
			id: randomUUID(),
			username: account.username,
			passwordHash: account.passwordHash,
			createdAt: timestamp()
		});
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
