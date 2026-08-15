import { fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import {
	grantTripAccess,
	listAvailableTripAccounts,
	listTripMembers,
	removeTripAccess,
	setSharedUserRole,
	setTripPublic
} from '$lib/server/store/members';
import { forceReleaseTripEditLocks, hasActiveTripEditSession } from '$lib/server/store/edit-locks';
import { StoreError } from '$lib/server/store/error';
import type { AuthenticatedUser, ShareRole } from '$lib/server/store/model';
import { getTripView } from '$lib/server/store/trips';
import type { DetailedTripView } from '$lib/server/store/views';

function sharedRole(value: string): ShareRole | null {
	return value === 'user' || value === 'admin' ? value : null;
}

function validationMessage(error: ZodError): string {
	return error.issues[0]?.message ?? 'Enter valid access details.';
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
	const slug = url.searchParams.get('trip');
	if (!slug) {
		redirect(303, '/');
	}
	return slug;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const access = await requireSudo(locals.user, tripSlug(url));
	const [availableAccounts, members, hasActiveEditSession] = await Promise.all([
		listAvailableTripAccounts(access.trip.id, access.user.id),
		listTripMembers(access.trip.id, access.user.id),
		hasActiveTripEditSession({ tripId: access.trip.id, userId: access.user.id })
	]);
	return { availableAccounts, currentUser: access.user, hasActiveEditSession, members, trip: access.trip };
};

export const actions: Actions = {
	grantUser: async ({ locals, request, url }) => {
		const access = await requireSudo(locals.user, tripSlug(url));
		const formData = await request.formData();
		const role = sharedRole(formDataText(formData, 'role'));
		if (!role) {
			return fail(400, { grantUserError: 'Choose either standard or admin access.' });
		}

		try {
			await grantTripAccess({
				actorId: access.user.id,
				role,
				tripId: access.trip.id,
				username: formDataText(formData, 'username')
			});
			return { userGranted: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { grantUserError: error.message });
			}
			if (error instanceof ZodError) {
				return fail(400, { grantUserError: validationMessage(error) });
			}
			throw error;
		}
	},
	setMemberRole: async ({ locals, request, url }) => {
		const access = await requireSudo(locals.user, tripSlug(url));
		const formData = await request.formData();
		const role = sharedRole(formDataText(formData, 'role'));
		if (!role) {
			return fail(400, { memberRoleError: 'Choose either standard or admin access.' });
		}

		try {
			await setSharedUserRole({
				actorId: access.user.id,
				role,
				tripId: access.trip.id,
				userId: formDataText(formData, 'memberId')
			});
			return { memberRoleUpdated: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { memberRoleError: error.message });
			}
			throw error;
		}
	},
	removeMember: async ({ locals, request, url }) => {
		const access = await requireSudo(locals.user, tripSlug(url));
		const formData = await request.formData();

		try {
			await removeTripAccess({
				actorId: access.user.id,
				tripId: access.trip.id,
				userId: formDataText(formData, 'memberId')
			});
			return { memberRemoved: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { memberRemovalError: error.message });
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
