import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { needsInitialSetup } from '$lib/server/store/auth';
import { getTripView, listTripSwitchOptions } from '$lib/server/store/trips';

export const load: PageServerLoad = async ({ locals }) => {
	const setupRequired = await needsInitialSetup();
	if (setupRequired) {
		redirect(303, '/setup');
	}
	if (!locals.user) {
		redirect(303, '/login');
	}

	const trips = await listTripSwitchOptions(locals.user.id);
	const initialTrip = trips[0];
	if (!initialTrip) {
		error(404, 'No trips are available.');
	}

	const trip = await getTripView(initialTrip.slug, locals.user);
	if (!trip) {
		error(404, 'The requested trip is unavailable.');
	}

	return {
		currentUser: locals.user,
		setupRequired,
		trip,
		trips
	};
};
