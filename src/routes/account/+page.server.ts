import { fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { resolveAccountTab } from '$lib/account/tabs';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { hasBodySizeAtMost, maximumAccountRequestBytes } from '$lib/server/request-size';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { changeOwnPassword, isSudoUser, updateOwnColourway, updateOwnUsername } from '$lib/server/store/auth';
import { StoreError } from '$lib/server/store/error';
import type { AuthenticatedSessionUser } from '$lib/server/store/model';
import { createSession } from '$lib/server/store/sessions';
import { validationMessage } from '$lib/server/validation';

function requireAccount(user: AuthenticatedSessionUser | null): AuthenticatedSessionUser {
	if (!user) {
		redirect(303, '/login');
	}
	return user;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const currentUser = requireAccount(locals.user);
	const canManageAccounts = await isSudoUser(currentUser.id);
	return {
		canManageAccounts,
		currentUser,
		selectedTab: resolveAccountTab(url.searchParams.get('tab'), canManageAccounts)
	};
};

export const actions: Actions = {
	changeUsername: async ({ locals, request }) => {
		const currentUser = requireAccount(locals.user);
		if (!hasBodySizeAtMost(request, maximumAccountRequestBytes)) {
			return fail(413, { usernameError: 'The username update request is too large.' });
		}

		try {
			const updatedUser = await updateOwnUsername({
				userId: currentUser.id,
				username: formDataText(await request.formData(), 'username')
			});
			locals.user = { ...currentUser, ...updatedUser };
			return { usernameUpdated: updatedUser.username };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { usernameError: error.message });
			}
			if (error instanceof ZodError) {
				return fail(400, { usernameError: validationMessage(error, 'Enter a valid username.') });
			}
			throw error;
		}
	},
	changeColourway: async ({ locals, request }) => {
		const currentUser = requireAccount(locals.user);
		if (!hasBodySizeAtMost(request, maximumAccountRequestBytes)) {
			return fail(413, { colourwayError: 'The colour update request is too large.' });
		}

		try {
			const colourway = await updateOwnColourway({
				colourway: formDataText(await request.formData(), 'colourway'),
				userId: currentUser.id
			});
			locals.user = { ...currentUser, colourway };
			return { colourwayUpdated: colourway };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { colourwayError: error.message });
			}
			if (error instanceof ZodError) {
				return fail(400, { colourwayError: validationMessage(error, 'Choose a valid colour.') });
			}
			throw error;
		}
	},
	changePassword: async ({ cookies, locals, request, url }) => {
		const currentUser = requireAccount(locals.user);
		if (!hasBodySizeAtMost(request, maximumAccountRequestBytes)) {
			return fail(413, { passwordError: 'The password update request is too large.' });
		}
		const formData = await request.formData();
		const newPassword = formDataText(formData, 'newPassword');
		if (newPassword !== formDataText(formData, 'newPasswordConfirmation')) {
			return fail(400, { passwordError: 'New passwords do not match.' });
		}

		try {
			await changeOwnPassword({
				currentPassword: formDataText(formData, 'currentPassword'),
				newPassword,
				userId: currentUser.id
			});
			const sessionId = await createSession(currentUser.id);
			cookies.set(sessionCookieName, sessionId, sessionCookieOptions(url));
			return { passwordChanged: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { passwordError: error.message });
			}
			if (error instanceof ZodError) {
				return fail(400, { passwordError: validationMessage(error, 'Enter a valid password.') });
			}
			throw error;
		}
	}
};
