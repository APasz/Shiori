import { z } from 'zod';
import { minimumPasswordLength, passwordMinimumMessage } from '$lib/auth/password-policy';
import { itineraryIdentifierSchema, itinerarySchema, unixTimestampSchema } from '$lib/itinerary/schema';

export const legacyStoredDataVersion = 6;
export const previousStoredDataVersion = 7;
export const priorStoredDataVersion = 8;
export const dailyExpenseStoredDataVersion = 9;
export const freeformExpenseStoredDataVersion = 10;
export const preNotesStoredDataVersion = 11;
export const storedDataVersion = 12;
export const tripStructureLockTargetId = 'trip-structure';

export const usernameSchema = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9_-]{2,31}$/i, 'Use 3–32 letters, numbers, underscores, or hyphens.');
export const passwordSchema = z
	.string()
	.min(minimumPasswordLength, passwordMinimumMessage())
	.max(1024, 'Use at most 1,024 characters for a password.');
export const shareRoleSchema = z.enum(['user', 'admin']);

const supportedStoredDataVersionSchema = z.union([
	z.literal(legacyStoredDataVersion),
	z.literal(previousStoredDataVersion),
	z.literal(priorStoredDataVersion),
	z.literal(dailyExpenseStoredDataVersion),
	z.literal(freeformExpenseStoredDataVersion),
	z.literal(preNotesStoredDataVersion),
	z.literal(storedDataVersion)
]);

export const storedUserSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	username: usernameSchema,
	passwordHash: z.string().min(1),
	createdAt: unixTimestampSchema
});

const persistedTripSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	ownerId: itineraryIdentifierSchema.nullable(),
	isPublic: z.boolean(),
	revision: z.number().int().nonnegative(),
	itinerary: itinerarySchema,
	createdAt: unixTimestampSchema,
	updatedAt: unixTimestampSchema
});
export const storedTripSchema = persistedTripSchema.extend({
	slug: itineraryIdentifierSchema
});

const storedShareSchema = z.strictObject({
	tripId: itineraryIdentifierSchema,
	userId: itineraryIdentifierSchema,
	role: shareRoleSchema
});
const storedSessionSchema = z.strictObject({
	id: itineraryIdentifierSchema,
	userId: itineraryIdentifierSchema,
	expiresAt: unixTimestampSchema
});
export const storedEditLockSchema = z.strictObject({
	tripId: itineraryIdentifierSchema,
	targetId: itineraryIdentifierSchema,
	ownerId: itineraryIdentifierSchema,
	token: z.string().uuid(),
	acquiredAt: unixTimestampSchema,
	expiresAt: unixTimestampSchema,
	revisionAtStart: z.number().int().nonnegative()
});

export const storedUsersFileSchema = z.strictObject({
	version: supportedStoredDataVersionSchema,
	users: z.array(storedUserSchema)
});
export const storedSharesFileSchema = z.strictObject({
	version: supportedStoredDataVersionSchema,
	shares: z.array(storedShareSchema)
});
export const storedSessionsFileSchema = z.strictObject({
	version: supportedStoredDataVersionSchema,
	sessions: z.array(storedSessionSchema)
});
export const storedEditLocksFileSchema = z.strictObject({
	version: supportedStoredDataVersionSchema,
	editLocks: z.array(storedEditLockSchema)
});
export const storedTripFileSchema = z.strictObject({
	version: z.literal(storedDataVersion),
	trip: persistedTripSchema
});

export const storedDataSchema = z
	.strictObject({
		version: z.literal(storedDataVersion),
		users: z.array(storedUserSchema),
		trips: z.array(storedTripSchema),
		shares: z.array(storedShareSchema),
		sessions: z.array(storedSessionSchema),
		editLocks: z.array(storedEditLockSchema)
	})
	.superRefine((data, context) => {
		const userIds = new Set<string>();
		const usernames = new Set<string>();
		for (const [index, user] of data.users.entries()) {
			if (userIds.has(user.id)) {
				context.addIssue({
					code: 'custom',
					path: ['users', index, 'id'],
					message: 'Each user ID must be unique.'
				});
			}
			userIds.add(user.id);

			const username = user.username.toLowerCase();
			if (usernames.has(username)) {
				context.addIssue({
					code: 'custom',
					path: ['users', index, 'username'],
					message: 'Each username must be unique.'
				});
			}
			usernames.add(username);
		}

		const tripIds = new Set<string>();
		const tripSlugs = new Set<string>();
		for (const [index, trip] of data.trips.entries()) {
			if (tripIds.has(trip.id)) {
				context.addIssue({
					code: 'custom',
					path: ['trips', index, 'id'],
					message: 'Each trip ID must be unique.'
				});
			}
			tripIds.add(trip.id);

			if (tripSlugs.has(trip.slug)) {
				context.addIssue({
					code: 'custom',
					path: ['trips', index, 'slug'],
					message: 'Each trip slug must be unique.'
				});
			}
			tripSlugs.add(trip.slug);

			if (trip.ownerId !== null && !userIds.has(trip.ownerId)) {
				context.addIssue({
					code: 'custom',
					path: ['trips', index, 'ownerId'],
					message: 'A trip owner must reference an existing user.'
				});
			}
		}

		const tripsById = new Map(data.trips.map((trip) => [trip.id, trip]));
		const sharedAccess = new Set<string>();
		for (const [index, share] of data.shares.entries()) {
			const trip = tripsById.get(share.tripId);
			if (!trip) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index, 'tripId'],
					message: 'A share must reference an existing trip.'
				});
			} else if (trip.ownerId === share.userId) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index, 'userId'],
					message: 'A trip owner cannot have a redundant shared-access record.'
				});
			}
			if (!userIds.has(share.userId)) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index, 'userId'],
					message: 'A share must reference an existing user.'
				});
			}

			const shareKey = `${share.tripId}:${share.userId}`;
			if (sharedAccess.has(shareKey)) {
				context.addIssue({
					code: 'custom',
					path: ['shares', index],
					message: 'A user can have only one share for a trip.'
				});
			}
			sharedAccess.add(shareKey);
		}

		const sessionIds = new Set<string>();
		for (const [index, session] of data.sessions.entries()) {
			if (sessionIds.has(session.id)) {
				context.addIssue({
					code: 'custom',
					path: ['sessions', index, 'id'],
					message: 'Each session ID must be unique.'
				});
			}
			sessionIds.add(session.id);
			if (!userIds.has(session.userId)) {
				context.addIssue({
					code: 'custom',
					path: ['sessions', index, 'userId'],
					message: 'A session must reference an existing user.'
				});
			}
		}

		const lockTokens = new Set<string>();
		const lockedTrips = new Set<string>();
		for (const [index, lock] of data.editLocks.entries()) {
			const trip = tripsById.get(lock.tripId);
			if (lockTokens.has(lock.token)) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'token'],
					message: 'Each edit lock token must be unique.'
				});
			}
			lockTokens.add(lock.token);
			if (lockedTrips.has(lock.tripId)) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'tripId'],
					message: 'A trip can have only one active edit lock.'
				});
			}
			lockedTrips.add(lock.tripId);
			if (!trip) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'tripId'],
					message: 'An edit lock must reference an existing trip.'
				});
			}
			if (!userIds.has(lock.ownerId)) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'ownerId'],
					message: 'An edit lock must reference an existing user.'
				});
			}
			if (trip && lock.ownerId !== trip.ownerId) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'ownerId'],
					message: 'An edit lock must belong to the trip owner.'
				});
			}
			if (
				trip &&
				lock.targetId !== tripStructureLockTargetId &&
				!trip.itinerary.items.some((item) => item.id === lock.targetId)
			) {
				context.addIssue({
					code: 'custom',
					path: ['editLocks', index, 'targetId'],
					message: 'An edit lock must target the trip structure or an existing itinerary item.'
				});
			}
		}
	});

export type StoredData = z.infer<typeof storedDataSchema>;
export type StoredTrip = z.infer<typeof storedTripSchema>;
export type PersistedTrip = z.infer<typeof persistedTripSchema>;
export type StoredUser = z.infer<typeof storedUserSchema>;
export type StoredEditLock = z.infer<typeof storedEditLockSchema>;
export type AuthenticatedUser = Pick<StoredUser, 'id' | 'username'>;
export type ShareRole = z.infer<typeof shareRoleSchema>;
