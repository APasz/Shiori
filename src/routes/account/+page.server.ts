import { error, fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { resolveAccountTab } from '$lib/account/tabs';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { hasBodySizeAtMost, maximumAccountRequestBytes } from '$lib/server/request-size';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import {
	changeOwnPassword,
	createAccount,
	deleteAccount,
	isSudoUser,
	listAccountsForManagement,
	resetAccountPassword,
	updateOwnColourway,
	updateOwnUsername
} from '$lib/server/store/auth';
import { StoreError } from '$lib/server/store/error';
import { listTripMembers, setTripMemberAccess } from '$lib/server/store/members';
import type { AuthenticatedSessionUser, AuthenticatedUser, TripMemberRole } from '$lib/server/store/model';
import { createSession } from '$lib/server/store/sessions';
import { listOwnedTripOptions } from '$lib/server/store/trips';
import { validationMessage } from '$lib/server/validation';
import type { OwnedTripOption } from '$lib/server/store/views';

type AdministrationContext = {
	manager: AuthenticatedUser;
	selectedTrip: OwnedTripOption | null;
	trips: OwnedTripOption[];
};

function requireAccount(user: AuthenticatedSessionUser | null): AuthenticatedSessionUser {
	if (!user) {
		redirect(303, '/login');
	}
	return user;
}

async function requireSudo(user: AuthenticatedUser | null): Promise<AuthenticatedUser> {
	if (!user) {
		redirect(303, '/login');
	}
	if (!(await isSudoUser(user.id))) {
		redirect(303, '/');
	}
	return user;
}

async function administrationContext(manager: AuthenticatedUser, url: URL): Promise<AdministrationContext> {
	const trips = await listOwnedTripOptions(manager.id);
	const fallbackTrip = trips[0];
	const requestedSlug = url.searchParams.get('trip');
	const selectedTrip = requestedSlug
		? (trips.find((trip) => trip.slug === requestedSlug) ?? null)
		: (fallbackTrip ?? null);
	if (requestedSlug && !selectedTrip) {
		error(404, 'The selected trip is not available for account management.');
	}

	return { manager, selectedTrip, trips };
}

async function requireAdministrationContext(user: AuthenticatedUser | null, url: URL): Promise<AdministrationContext> {
	return administrationContext(await requireSudo(user), url);
}

async function loadAdministration(manager: AuthenticatedUser, url: URL) {
	const context = await administrationContext(manager, url);
	const [accounts, members] = await Promise.all([
		listAccountsForManagement(context.manager.id),
		context.selectedTrip ? listTripMembers(context.selectedTrip.id, context.manager.id) : Promise.resolve([])
	]);
	const rolesByUserId = new Map(members.map((member) => [member.id, member.role]));

	return {
		accounts: accounts.map((account) => ({ ...account, role: rolesByUserId.get(account.id) ?? 'none' })),
		selectedTrip: context.selectedTrip,
		trips: context.trips
	};
}

function selectedMemberRole(value: string): TripMemberRole | null | undefined {
	if (value === 'remove') {
		return null;
	}
	if (value === 'none' || value === 'user' || value === 'admin') {
		return value;
	}
	return undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const currentUser = requireAccount(locals.user);
	const canManageAccounts = await isSudoUser(currentUser.id);
	const selectedTab = resolveAccountTab(url.searchParams.get('tab'), canManageAccounts);
	return {
		administration: selectedTab === 'administration' ? await loadAdministration(currentUser, url) : null,
		canManageAccounts,
		currentUser,
		selectedTab
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
	},
	createAccount: async ({ locals, request }) => {
		const manager = await requireSudo(locals.user);
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
				return fail(400, { createAccountError: validationMessage(error, 'Enter valid account details.') });
			}
			throw error;
		}
	},
	resetPassword: async ({ locals, request }) => {
		const manager = await requireSudo(locals.user);
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
				return fail(400, { passwordResetError: validationMessage(error, 'Enter valid account details.') });
			}
			throw error;
		}
	},
	setTripAccess: async ({ locals, request, url }) => {
		const context = await requireAdministrationContext(locals.user, url);
		if (!context.selectedTrip) {
			return fail(400, { memberAccessError: 'Choose a trip you own before changing trip access.' });
		}
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
		const manager = await requireSudo(locals.user);
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
