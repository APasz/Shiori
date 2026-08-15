import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { needsInitialSetup } from '$lib/server/store/auth';
import { listTripSwitchOptions, ownsAnyTrip } from '$lib/server/store/trips';

export const load: PageServerLoad = async ({ locals }) => {
	const setupRequired = await needsInitialSetup();
	if (setupRequired) {
		redirect(303, '/setup');
	}
	const user = locals.user;
	if (!user) {
		redirect(303, '/login');
	}

	const [trips, canManageAccounts] = await Promise.all([listTripSwitchOptions(user.id), ownsAnyTrip(user.id)]);

	return {
		canManageAccounts,
		currentUser: user,
		trips
	};
};
