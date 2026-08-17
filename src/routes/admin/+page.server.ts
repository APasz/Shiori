import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessionCookieName } from '$lib/server/session';
import { forceReleaseAllEditLocks, hasActiveEditSessions } from '$lib/server/store/edit-locks';
import { StoreError } from '$lib/server/store/error';
import { forceLogoutAllUsers, listActiveSessionUsers } from '$lib/server/store/sessions';
import { ownsAnyTrip } from '$lib/server/store/trips';

async function requireAdmin(user: App.Locals['user']) {
	if (!user) {
		redirect(303, '/login');
	}
	if (!(await ownsAnyTrip(user.id))) {
		redirect(303, '/');
	}
	return user;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = await requireAdmin(locals.user);
	const [hasActiveEdits, users] = await Promise.all([hasActiveEditSessions(user.id), listActiveSessionUsers(user.id)]);
	return {
		currentUser: user,
		hasActiveEdits,
		users
	};
};

export const actions: Actions = {
	forceCloseEditSessions: async ({ locals }) => {
		const user = await requireAdmin(locals.user);
		try {
			return await forceReleaseAllEditLocks(user.id);
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { forceCloseError: error.message });
			}
			throw error;
		}
	},
	forceLogoutUsers: async ({ cookies, locals }) => {
		const user = await requireAdmin(locals.user);
		try {
			await forceLogoutAllUsers(user.id);
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { forceLogoutError: error.message });
			}
			throw error;
		}
		cookies.delete(sessionCookieName, { path: '/' });
		redirect(303, '/login');
	}
};
