import { randomUUID } from 'node:crypto';
import { projectDetailedItinerary, projectPublicItinerary, type TripAccessRole } from '$lib/itinerary/access';
import { itinerarySchema, tripDetailsSchema, type Itinerary } from '$lib/itinerary/schema';
import { createTripBackup, tripBackupSchema, type TripBackup } from '$lib/trip-backup';
import { timingStartTimestamp } from '$lib/itinerary/timing';
import { assertSudo } from './auth';
import { StoreError } from './error';
import type { AuthenticatedUser, StoredData, StoredTrip, TripMemberRole } from './model';
import { readData, transaction } from './persistence';
import { timestamp } from './time';
import type { OwnedTripOption, TripReference, TripSwitchOption, TripView } from './views';

export function findTripBySlug(data: StoredData, slug: string): StoredTrip | undefined {
	return data.trips.find((trip) => trip.slug === slug);
}

export function requireTripById(data: StoredData, tripId: string): StoredTrip {
	const trip = data.trips.find((candidate) => candidate.id === tripId);
	if (!trip) {
		throw new StoreError(404, 'Trip not found.');
	}
	return trip;
}

export function assertTripOwner(trip: StoredTrip, userId: string): void {
	if (trip.ownerId !== userId) {
		throw new StoreError(403, 'Only the sudo user can edit this trip.');
	}
}

export function getTripForMutation(data: StoredData, tripId: string, userId: string): StoredTrip {
	const trip = requireTripById(data, tripId);
	assertTripOwner(trip, userId);
	return trip;
}

export function getTripAccess(
	data: StoredData,
	trip: StoredTrip,
	user: AuthenticatedUser | null,
	sharedRolesByTripId?: ReadonlyMap<string, TripMemberRole>
): TripAccessRole | null {
	if (user?.id === trip.ownerId) {
		return 'sudo';
	}

	if (user) {
		const sharedRole = sharedRolesByTripId?.get(trip.id);
		const role =
			sharedRole ??
			(sharedRolesByTripId === undefined
				? data.shares.find((candidate) => candidate.tripId === trip.id && candidate.userId === user.id)?.role
				: undefined);
		if (role !== undefined) {
			return role === 'none' ? null : role;
		}
	}

	return trip.isPublic ? 'visitor' : null;
}

export function findItemIndex(itinerary: Itinerary, itemId: string): number {
	return itinerary.items.findIndex((item) => item.id === itemId);
}

export function assertExpectedRevision(trip: StoredTrip, revision: number): void {
	if (trip.revision !== revision) {
		throw new StoreError(409, 'This trip changed before your edit could be saved. Reload and try again.');
	}
}

export function assertNoActiveEditLock(data: StoredData, trip: StoredTrip): void {
	if (data.editLocks.some((lock) => lock.tripId === trip.id)) {
		throw new StoreError(423, 'This trip is currently being edited.');
	}
}

export function commitItineraryChange(trip: StoredTrip, itinerary: Itinerary): { revision: number } {
	trip.itinerary = itinerarySchema.parse(itinerary);
	trip.revision += 1;
	trip.updatedAt = timestamp();
	return { revision: trip.revision };
}

function slugBaseForTitle(title: string): string {
	const normalized = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return normalized || 'trip';
}

function uniqueTripSlug(trips: StoredTrip[], title: string): string {
	const base = slugBaseForTitle(title);
	const existingSlugs = new Set(trips.map((trip) => trip.slug));
	if (!existingSlugs.has(base)) {
		return base;
	}

	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!existingSlugs.has(candidate)) {
			return candidate;
		}
	}
}

function addTrip(data: StoredData, sudoUserId: string, itinerary: Itinerary): TripReference {
	const createdAt = timestamp();
	const trip: StoredTrip = {
		id: randomUUID(),
		slug: uniqueTripSlug(data.trips, itinerary.title),
		ownerId: sudoUserId,
		isPublic: false,
		revision: 0,
		itinerary,
		createdAt,
		updatedAt: createdAt
	};
	data.trips.push(trip);
	return { id: trip.id, slug: trip.slug };
}

function latestItemStartAt(itinerary: Itinerary): number | null {
	if (itinerary.items.length === 0) {
		return null;
	}
	let latestStartAt = timingStartTimestamp(itinerary.items[0]!.timing);
	for (let index = 1; index < itinerary.items.length; index += 1) {
		latestStartAt = Math.max(latestStartAt, timingStartTimestamp(itinerary.items[index]!.timing));
	}
	return latestStartAt;
}

function compareTripSwitchOptions(left: TripSwitchOption, right: TripSwitchOption): number {
	const leftLatestItemStartAt = left.latestItemStartAt;
	const rightLatestItemStartAt = right.latestItemStartAt;
	if (leftLatestItemStartAt === null && rightLatestItemStartAt !== null) {
		return -1;
	}
	if (leftLatestItemStartAt !== null && rightLatestItemStartAt === null) {
		return 1;
	}
	if (leftLatestItemStartAt === null && rightLatestItemStartAt === null) {
		return right.updatedAt - left.updatedAt || left.title.localeCompare(right.title);
	}
	if (leftLatestItemStartAt === null || rightLatestItemStartAt === null) {
		throw new Error('Trip switch options must consistently identify empty trips.');
	}
	return (
		rightLatestItemStartAt - leftLatestItemStartAt ||
		right.updatedAt - left.updatedAt ||
		left.title.localeCompare(right.title)
	);
}

export async function getTripView(slug: string, user: AuthenticatedUser | null): Promise<TripView | null> {
	const data = await readData();
	const trip = findTripBySlug(data, slug);
	if (!trip) {
		return null;
	}

	const access = getTripAccess(data, trip, user);
	if (!access) {
		return null;
	}

	if (access === 'visitor') {
		return {
			access,
			canEdit: false,
			id: trip.id,
			isPublic: trip.isPublic,
			revision: trip.revision,
			slug: trip.slug,
			itinerary: projectPublicItinerary(trip.itinerary)
		};
	}

	return {
		access,
		canEdit: access === 'sudo',
		id: trip.id,
		isPublic: trip.isPublic,
		revision: trip.revision,
		slug: trip.slug,
		itinerary: projectDetailedItinerary(trip.itinerary, access)
	};
}

export async function createTrip(input: { actorId: string; details: unknown }): Promise<TripReference> {
	const details = tripDetailsSchema.parse(input.details);

	return transaction(
		(data) => {
			assertSudo(data, input.actorId);
			return addTrip(data, input.actorId, { ...details, expenses: [], items: [], notes: [] });
		},
		{
			global: [],
			tripIds: (trip) => [trip.id]
		}
	);
}

/** Deletes a sudo-owned trip together with every account-specific access record for it. */
export async function deleteTrip(input: { revision: number; tripId: string; userId: string }): Promise<void> {
	await transaction(
		(data) => {
			assertSudo(data, input.userId);
			const trip = getTripForMutation(data, input.tripId, input.userId);
			assertExpectedRevision(trip, input.revision);
			assertNoActiveEditLock(data, trip);
			data.trips = data.trips.filter((candidate) => candidate.id !== trip.id);
			data.shares = data.shares.filter((share) => share.tripId !== trip.id);
			return { slug: trip.slug };
		},
		{
			deletedTripSlugs: (deletedTrip) => [deletedTrip.slug],
			global: ['shares'],
			tripIds: []
		}
	);
}

/** Returns a complete backup only to the sole sudo user, never to shared users or visitors. */
export async function exportTripBackup(input: { tripId: string; userId: string }): Promise<TripBackup> {
	const data = await readData();
	const trip = getTripForMutation(data, input.tripId, input.userId);
	return createTripBackup(trip.itinerary, timestamp());
}

/** Restores an itinerary as a new private trip owned by the sole sudo account. */
export async function importTripBackup(input: { actorId: string; backup: TripBackup }): Promise<TripReference> {
	const backup = tripBackupSchema.parse(input.backup);
	return transaction(
		(data) => {
			assertSudo(data, input.actorId);
			return addTrip(data, input.actorId, backup.itinerary);
		},
		{
			global: [],
			tripIds: (trip) => [trip.id]
		}
	);
}

export async function listTripSwitchOptions(userId: string): Promise<TripSwitchOption[]> {
	const data = await readData();
	const user = data.users.find((candidate) => candidate.id === userId);
	if (!user) {
		return [];
	}
	const sharedRolesByTripId = new Map<string, TripMemberRole>();
	for (const share of data.shares) {
		if (share.userId === user.id) {
			sharedRolesByTripId.set(share.tripId, share.role);
		}
	}

	return data.trips
		.filter((trip) => getTripAccess(data, trip, user, sharedRolesByTripId) !== null)
		.map((trip) => ({
			latestItemStartAt: latestItemStartAt(trip.itinerary),
			slug: trip.slug,
			title: trip.itinerary.title,
			updatedAt: trip.updatedAt
		}))
		.sort(compareTripSwitchOptions);
}

export async function listOwnedTripOptions(userId: string): Promise<OwnedTripOption[]> {
	const data = await readData();
	return data.trips
		.filter((trip) => trip.ownerId === userId)
		.map((trip) => ({ id: trip.id, slug: trip.slug, title: trip.itinerary.title }))
		.sort((left, right) => left.title.localeCompare(right.title));
}

export async function assertTripOwnerAccess(input: { tripId: string; userId: string }): Promise<void> {
	const data = await readData();
	getTripForMutation(data, input.tripId, input.userId);
}
