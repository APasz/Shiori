import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessionCookieName } from '$lib/server/session';
import { destroySession } from '$lib/server/store';

export const POST: RequestHandler = async ({ cookies }) => {
	await destroySession(cookies.get(sessionCookieName));
	cookies.delete(sessionCookieName, { path: '/' });
	redirect(303, '/');
};
