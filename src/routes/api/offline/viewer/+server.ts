import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const anonymousOfflineViewerId = 'public';

/** Returns the server-verified cache partition for the requesting browser session. */
export const GET: RequestHandler = ({ locals }) =>
	json({ viewerId: locals.user?.id ?? anonymousOfflineViewerId }, { headers: { 'cache-control': 'no-store' } });
