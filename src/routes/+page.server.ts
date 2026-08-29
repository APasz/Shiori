import { redirect } from '@sveltejs/kit';
import packageMetadata from '../../package.json';
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
	const releaseId = process.env.SHIORI_RELEASE_ID;
	const releaseShortSha = process.env.SHIORI_RELEASE_SHORT_SHA || releaseId?.slice(0, 7) || null;
	const releaseCommitUrl = releaseId ? `${packageMetadata.repository}/commit/${encodeURIComponent(releaseId)}` : null;

	return {
		appVersion: packageMetadata.version,
		canManageAccounts,
		currentUser: user,
		releaseCommitUrl,
		releaseShortSha,
		repositoryUrl: packageMetadata.repository,
		trips
	};
};
