import { randomUUID } from 'node:crypto';
import { projectDetailedItinerary, projectPublicItinerary, type TripAccessRole } from '$lib/itinerary/access';
import { itinerarySchema, tripDetailsSchema, type Itinerary } from '$lib/itinerary/schema';
import { timingStartTimestamp } from '$lib/itinerary/timing';
import { StoreError } from './error';
import type { AuthenticatedUser, StoredData, StoredTrip } from './model';
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
		throw new StoreError(403, 'Only the trip owner can edit this trip.');
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
	user: AuthenticatedUser | null
): TripAccessRole | null {
	if (user?.id === trip.ownerId) {
		return 'sudo';
	}

	if (user) {
		const share = data.shares.find((candidate) => candidate.tripId === trip.id && candidate.userId === user.id);
		if (share) {
			return share.role;
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

function latestItemStartAt(itinerary: Itinerary): number | null {
	if (itinerary.items.length === 0) {
		return null;
	}
	return Math.max(...itinerary.items.map((item) => timingStartTimestamp(item.timing)));
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

export async function createTrip(input: { details: unknown; ownerId: string }): Promise<TripReference> {
	const details = tripDetailsSchema.parse(input.details);

	return transaction((data) => {
		if (!data.users.some((user) => user.id === input.ownerId)) {
			throw new StoreError(401, 'The signed-in account no longer exists.');
		}

		const createdAt = timestamp();
		const trip: StoredTrip = {
			id: randomUUID(),
			slug: uniqueTripSlug(data.trips, details.title),
			ownerId: input.ownerId,
			isPublic: false,
			revision: 0,
			itinerary: { ...details, expenses: [], items: [], notes: [] },
			createdAt,
			updatedAt: createdAt
		};
		data.trips.push(trip);
		return { id: trip.id, slug: trip.slug };
	});
}

export async function listTripSwitchOptions(userId: string): Promise<TripSwitchOption[]> {
	const data = await readData();
	const user = data.users.find((candidate) => candidate.id === userId);
	if (!user) {
		return [];
	}

	return data.trips
		.filter((trip) => getTripAccess(data, trip, user) !== null)
		.map((trip) => ({
			latestItemStartAt: latestItemStartAt(trip.itinerary),
			slug: trip.slug,
			title: trip.itinerary.title,
			updatedAt: trip.updatedAt
		}))
		.sort(compareTripSwitchOptions);
}

export async function ownsAnyTrip(userId: string): Promise<boolean> {
	const data = await readData();
	return data.trips.some((trip) => trip.ownerId === userId);
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
