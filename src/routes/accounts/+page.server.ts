import { error, fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { createAccount, deleteAccount, listAccountsForManagement, resetAccountPassword } from '$lib/server/store/auth';
import { StoreError } from '$lib/server/store/error';
import { listTripMembers, setTripMemberAccess } from '$lib/server/store/members';
import type { AuthenticatedUser, TripMemberRole } from '$lib/server/store/model';
import { listOwnedTripOptions, ownsAnyTrip } from '$lib/server/store/trips';

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

async function accountContext(user: AuthenticatedUser | null, url: URL) {
	const manager = await requireAccountManager(user);
	const trips = await listOwnedTripOptions(manager.id);
	const fallbackTrip = trips[0];
	if (!fallbackTrip) {
		throw new Error('An account manager must own at least one trip.');
	}

	const selectedSlug = url.searchParams.get('trip') ?? fallbackTrip.slug;
	const selectedTrip = trips.find((trip) => trip.slug === selectedSlug);
	if (!selectedTrip) {
		error(404, 'The selected trip is not available for account management.');
	}

	return { manager, selectedTrip, trips };
}

function selectedMemberRole(value: string): TripMemberRole | null | undefined {
	if (value === 'remove') {
		return null;
	}
	if (value === 'none') {
		return value;
	}
	if (value === 'user' || value === 'admin') {
		return value;
	}
	return undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const context = await accountContext(locals.user, url);
	const [accounts, members] = await Promise.all([
		listAccountsForManagement(context.manager.id),
		listTripMembers(context.selectedTrip.id, context.manager.id)
	]);
	const rolesByUserId = new Map(members.map((member) => [member.id, member.role]));

	return {
		accounts: accounts.map((account) => ({ ...account, role: rolesByUserId.get(account.id) ?? 'none' })),
		currentUser: context.manager,
		selectedTrip: context.selectedTrip,
		trips: context.trips
	};
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
	},
	setTripAccess: async ({ locals, request, url }) => {
		const context = await accountContext(locals.user, url);
		const formData = await request.formData();
		const role = selectedMemberRole(formDataText(formData, 'role'));
		if (role === undefined) {
			return fail(400, { memberAccessError: 'Choose a valid access level.' });
		}

		try {
			await setTripMemberAccess({
				actorId: context.manager.id,
				role,
				tripId: context.selectedTrip.id,
				userId: formDataText(formData, 'userId')
			});
			return { memberAccessUpdated: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { memberAccessError: error.message });
			}
			throw error;
		}
	},
	deleteAccount: async ({ locals, request }) => {
		const manager = await requireAccountManager(locals.user);
		const userId = formDataText(await request.formData(), 'userId');
		if (userId === manager.id) {
			return fail(400, { accountDeletionError: 'You cannot delete your own account.' });
		}

		try {
			await deleteAccount({ actorId: manager.id, userId });
			return { accountDeleted: true };
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { accountDeletionError: error.message });
			}
			throw error;
		}
	}
};
