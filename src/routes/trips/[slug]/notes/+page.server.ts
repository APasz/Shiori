import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTripView, needsInitialSetup } from '$lib/server/store';

export const load: PageServerLoad = async ({ locals, params }) => {
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
	if (trip.access === 'visitor') {
		error(403, 'Notes are available only to signed-in trip members.');
	}

	return {
		currentUser: locals.user,
		trip
	};
};
