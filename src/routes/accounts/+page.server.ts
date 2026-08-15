import { fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { createAccount, listAccounts, resetAccountPassword } from '$lib/server/store/auth';
import { StoreError } from '$lib/server/store/error';
import type { AuthenticatedUser } from '$lib/server/store/model';
import { ownsAnyTrip } from '$lib/server/store/trips';

function validationMessage(error: ZodError): string {
	return error.issues[0]?.message ?? 'Enter valid account details.';
}

async function requireAccountManager(user: AuthenticatedUser | null): Promise<AuthenticatedUser> {
	if (!user) {
		redirect(303, '/login');
	}
	if (!(await ownsAnyTrip(user.id))) {
		redirect(303, '/');
	}
	return user;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = await requireAccountManager(locals.user);
	return { accounts: await listAccounts(user.id), currentUserId: user.id };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const manager = await requireAccountManager(locals.user);
		const formData = await request.formData();

		try {
			const account = await createAccount({
				actorId: manager.id,
				password: formDataText(formData, 'password'),
				username: formDataText(formData, 'username')
			});
			return { createdAccount: account.username };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { createAccountError: error.message });
			}
			if (error instanceof ZodError) {
				return fail(400, { createAccountError: validationMessage(error) });
			}
			throw error;
		}
	},
	resetPassword: async ({ locals, request }) => {
		const manager = await requireAccountManager(locals.user);
		const formData = await request.formData();
		const userId = formDataText(formData, 'userId');
		if (userId === manager.id) {
			return fail(400, { passwordResetError: 'You cannot reset your own password here.' });
		}

		try {
			await resetAccountPassword({ actorId: manager.id, password: formDataText(formData, 'password'), userId });
			return { passwordReset: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { passwordResetError: error.message });
			}
			if (error instanceof ZodError) {
				return fail(400, { passwordResetError: validationMessage(error) });
			}
			throw error;
		}
	}
};
