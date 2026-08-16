import type { Handle } from '@sveltejs/kit';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { refreshSession } from '$lib/server/store/sessions';

const securityHeaders = {
	'cache-control': 'no-store',
	'cross-origin-opener-policy': 'same-origin',
	'referrer-policy': 'same-origin',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY'
} as const;

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(sessionCookieName);
	const session = await refreshSession(sessionId);
	event.locals.user = session?.user ?? null;

	if (session && sessionId) {
		if (session.renewed) {
			event.cookies.set(sessionCookieName, sessionId, sessionCookieOptions(event.url));
		}
	} else if (sessionId) {
		event.cookies.delete(sessionCookieName, { path: '/' });
	}

	const response = await resolve(event);
	for (const [name, value] of Object.entries(securityHeaders)) {
		response.headers.set(name, value);
	}
	return response;
};
