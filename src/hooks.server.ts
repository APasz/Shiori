import { building } from '$app/environment';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { assertProductionConfiguration } from '$lib/server/production-config';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { initializeStore } from '$lib/server/store/persistence';
import { refreshSession } from '$lib/server/store/sessions';
import { initializeSystemMetrics, shutdownSystemMetrics } from '$lib/server/system-metrics';
import { defaultColourway } from '$lib/theme/colourway';

assertProductionConfiguration(process.env);

let systemMetricsShutdownRegistered = false;

function registerSystemMetricsShutdown(): void {
	if (systemMetricsShutdownRegistered) {
		return;
	}
	systemMetricsShutdownRegistered = true;
	process.once('sveltekit:shutdown', () => {
		void shutdownSystemMetrics().catch((error: unknown) => {
			console.error('Shiori system metrics could not finish shutting down.', error);
		});
	});
}

export const init: ServerInit = async () => {
	if (!building) {
		await initializeStore();
		await initializeSystemMetrics();
		registerSystemMetricsShutdown();
	}
};

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

	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace(
				'<html lang="en">',
				`<html lang="en" data-colourway="${event.locals.user?.colourway ?? defaultColourway}">`
			)
	});
	if (sessionCookieChanged || !response.headers.has('cache-control')) {
		response.headers.set('cache-control', 'no-store');
	}
	for (const [name, value] of Object.entries(securityHeaders)) {
		response.headers.set(name, value);
	}
	return response;
};
