import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isSudoUser, needsInitialSetup } from '$lib/server/store/auth';
import { publicTripCacheControl } from '$lib/server/public-cache';
import { getTripView } from '$lib/server/store/trips';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	const setupRequired = await needsInitialSetup();
	const trip = await getTripView(params.slug, locals.user);
	if (!trip) {
		if (setupRequired) {
			redirect(303, '/setup');
		}
		if (!locals.user) {
			redirect(303, '/login');
		}
		error(404, 'The requested trip is unavailable.');
	}
	if (trip.access === 'visitor' && !locals.user) {
		setHeaders({
			'cache-control': publicTripCacheControl,
			vary: 'Cookie'
		});
	}

	const canManageAccounts = locals.user ? await isSudoUser(locals.user.id) : false;
	return {
		canManageAccounts,
		currentUser: locals.user,
		setupRequired,
		trip
	};
};
