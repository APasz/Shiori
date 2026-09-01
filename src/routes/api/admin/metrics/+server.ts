import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSudoUser } from '$lib/server/store/auth';
import { serverMetricsSnapshot } from '$lib/server/system-metrics';

const noStoreHeaders = { 'cache-control': 'no-store' };

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json(
			{ message: 'Sign in as the sudo user to view server metrics.' },
			{ headers: noStoreHeaders, status: 401 }
		);
	}
	if (!(await isSudoUser(locals.user.id))) {
		return json({ message: 'Only the sudo user can view server metrics.' }, { headers: noStoreHeaders, status: 403 });
	}
	return json(serverMetricsSnapshot(), { headers: noStoreHeaders });
};
