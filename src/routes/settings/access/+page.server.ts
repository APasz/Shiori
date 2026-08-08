import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import {
	createSharedUser,
	forceReleaseTripEditLocks,
	getTripView,
	hasActiveTripEditSession,
	listTripMembers,
	setTripPublic,
	StoreError,
	type AuthenticatedUser,
	type DetailedTripView,
	type ShareRole
} from '$lib/server/store';

function sharedRole(value: string): ShareRole | null {
	return value === 'user' || value === 'admin' ? value : null;
}

async function requireSudo(
	user: AuthenticatedUser | null,
	slug: string
): Promise<{ trip: DetailedTripView; user: AuthenticatedUser }> {
	if (!user) {
		redirect(303, '/login');
	}

	const trip = await getTripView(slug, user);
	if (!trip || trip.access !== 'sudo') {
		redirect(303, '/');
	}
	return { trip, user };
}

function tripSlug(url: URL): string {
	return url.searchParams.get('trip') ?? 'example';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const access = await requireSudo(locals.user, tripSlug(url));
	const [members, hasActiveEditSession] = await Promise.all([
		listTripMembers(access.trip.id, access.user.id),
		hasActiveTripEditSession({ tripId: access.trip.id, userId: access.user.id })
	]);
	return { hasActiveEditSession, members, trip: access.trip };
};

export const actions: Actions = {
	createUser: async ({ locals, request, url }) => {
		const access = await requireSudo(locals.user, tripSlug(url));
		const formData = await request.formData();
		const role = sharedRole(formDataText(formData, 'role'));
		if (!role) {
			return fail(400, { error: 'Choose either user or admin access.' });
		}

		try {
			await createSharedUser({
				actorId: access.user.id,
				password: formDataText(formData, 'password'),
				role,
				tripId: access.trip.id,
				username: formDataText(formData, 'username')
			});
			return { created: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { error: error.message });
			}
			throw error;
		}
	},
	visitorAccess: async ({ locals, request, url }) => {
		const access = await requireSudo(locals.user, tripSlug(url));
		const formData = await request.formData();
		await setTripPublic({
			actorId: access.user.id,
			isPublic: formData.get('isPublic') === 'on',
			tripId: access.trip.id
		});
		return { visibilityUpdated: true };
	},
	forceCloseEditSession: async ({ locals, url }) => {
		const access = await requireSudo(locals.user, tripSlug(url));
		const { released } = await forceReleaseTripEditLocks({
			tripId: access.trip.id,
			userId: access.user.id
		});
		return { editSessionReleased: released > 0 };
	}
};
