import { fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { hasBodySizeAtMost, maximumCredentialRequestBytes } from '$lib/server/request-size';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { changeOwnPassword, isSudoUser, updateOwnUsername } from '$lib/server/store/auth';
import { StoreError } from '$lib/server/store/error';
import type { AuthenticatedUser } from '$lib/server/store/model';
import { createSession } from '$lib/server/store/sessions';
import { validationMessage } from '$lib/server/validation';

function requireAccount(user: AuthenticatedUser | null): AuthenticatedUser {
	if (!user) {
		redirect(303, '/login');
	}
	return user;
}

export const load: PageServerLoad = async ({ locals }) => {
	const currentUser = requireAccount(locals.user);
	return {
		canManageAccounts: await isSudoUser(currentUser.id),
		currentUser
	};
};

export const actions: Actions = {
	changeUsername: async ({ locals, request }) => {
		const currentUser = requireAccount(locals.user);
		if (!hasBodySizeAtMost(request, maximumCredentialRequestBytes)) {
			return fail(413, { usernameError: 'The username update request is too large.' });
		}

		try {
			const updatedUser = await updateOwnUsername({
				userId: currentUser.id,
				username: formDataText(await request.formData(), 'username')
			});
			locals.user = updatedUser;
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
	changePassword: async ({ cookies, locals, request, url }) => {
		const currentUser = requireAccount(locals.user);
		if (!hasBodySizeAtMost(request, maximumCredentialRequestBytes)) {
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
