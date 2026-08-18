import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isSudoUser, needsInitialSetup } from '$lib/server/store/auth';
import { listTripSwitchOptions } from '$lib/server/store/trips';

export const load: PageServerLoad = async ({ locals }) => {
	const setupRequired = await needsInitialSetup();
	if (setupRequired) {
		redirect(303, '/setup');
	}
	const user = locals.user;
	if (!user) {
		redirect(303, '/login');
	}

	const [trips, canManageAccounts] = await Promise.all([listTripSwitchOptions(user.id), isSudoUser(user.id)]);

	return {
		canManageAccounts,
		currentUser: user,
		trips
	};
};
