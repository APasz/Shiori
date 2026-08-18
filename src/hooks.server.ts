import type { Handle } from '@sveltejs/kit';
import { assertProductionConfiguration } from '$lib/server/production-config';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { refreshSession } from '$lib/server/store/sessions';

assertProductionConfiguration(process.env);

const securityHeaders = {
	'cross-origin-opener-policy': 'same-origin',
	'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
	'referrer-policy': 'same-origin',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY'
} as const;

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(sessionCookieName);
	const session = await refreshSession(sessionId);
	event.locals.user = session?.user ?? null;
	let sessionCookieChanged = false;

	if (session && sessionId) {
		if (session.renewed) {
			event.cookies.set(sessionCookieName, sessionId, sessionCookieOptions(event.url));
			sessionCookieChanged = true;
		}
	} else if (sessionId) {
		event.cookies.delete(sessionCookieName, { path: '/' });
		sessionCookieChanged = true;
	}

	const response = await resolve(event);
	if (sessionCookieChanged || !response.headers.has('cache-control')) {
		response.headers.set('cache-control', 'no-store');
	}
	for (const [name, value] of Object.entries(securityHeaders)) {
		response.headers.set(name, value);
	}
	return response;
};
