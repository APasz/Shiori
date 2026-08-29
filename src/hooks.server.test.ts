import type { ResolveOptions } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionCookieName, sessionLifetimeSeconds } from '$lib/server/session';
import { defaultColourway } from '$lib/theme/colourway';

const refreshSession = vi.hoisted(() => vi.fn());
const initializeStore = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/store/sessions', () => ({ refreshSession }));
vi.mock('$lib/server/store/persistence', () => ({ initializeStore }));

import { handle, init } from './hooks.server';

type HandleInput = Parameters<typeof handle>[0];
type TestCookies = {
	delete: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
};

function handleInput(
	cookies: TestCookies,
	response = new Response(),
	onResolve?: (event: HandleInput['event'], options: ResolveOptions | undefined) => void
): HandleInput {
	return {
		event: {
			cookies,
			locals: {},
			url: new URL('https://shiori.example/')
		} as unknown as HandleInput['event'],
		resolve: async (event, options) => {
			onResolve?.(event, options);
			return response;
		}
	};
}

describe('server hook', () => {
	beforeEach(() => {
		refreshSession.mockReset();
		initializeStore.mockReset();
	});

	it('initializes the store before accepting requests', async () => {
		await init();

		expect(initializeStore).toHaveBeenCalledOnce();
	});

	it('refreshes the browser cookie when the authenticated session is renewed', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'active-session'),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue({
			renewed: true,
			user: { colourway: defaultColourway, id: 'user-1', username: 'owner' }
		});

		const response = await handle(handleInput(cookies));

		expect(refreshSession).toHaveBeenCalledWith('active-session');
		expect(cookies.set).toHaveBeenCalledWith(sessionCookieName, 'active-session', {
			httpOnly: true,
			maxAge: sessionLifetimeSeconds,
			path: '/',
			sameSite: 'lax',
			secure: true
		});
		expect(cookies.delete).not.toHaveBeenCalled();
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('does not refresh the browser cookie before session renewal is due', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'active-session'),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue({
			renewed: false,
			user: { colourway: defaultColourway, id: 'user-1', username: 'owner' }
		});

		await handle(handleInput(cookies));

		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('sets the signed-in account colourway on the document before rendering', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'active-session'),
			set: vi.fn()
		};
		let resolveOptions: ResolveOptions | undefined;
		refreshSession.mockResolvedValue({
			renewed: false,
			user: { colourway: 'violet', id: 'user-1', username: 'owner' }
		});

		await handle(handleInput(cookies, new Response(), (_event, options) => (resolveOptions = options)));

		const transformPageChunk = resolveOptions?.transformPageChunk;
		if (!transformPageChunk) {
			throw new Error('The server hook must transform page HTML.');
		}
		expect(await transformPageChunk({ done: false, html: '<html lang="en">' })).toBe(
			'<html lang="en" data-colourway="violet">'
		);
	});

	it('uses the colourway written during page-action rendering', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'active-session'),
			set: vi.fn()
		};
		let resolveOptions: ResolveOptions | undefined;
		refreshSession.mockResolvedValue({
			renewed: false,
			user: { colourway: defaultColourway, id: 'user-1', username: 'owner' }
		});

		await handle(
			handleInput(cookies, new Response(), (event, options) => {
				event.locals.user = { colourway: 'sunset', id: 'user-1', username: 'owner' };
				resolveOptions = options;
			})
		);

		const transformPageChunk = resolveOptions?.transformPageChunk;
		if (!transformPageChunk) {
			throw new Error('The server hook must transform page HTML.');
		}
		expect(await transformPageChunk({ done: false, html: '<html lang="en">' })).toBe(
			'<html lang="en" data-colourway="sunset">'
		);
	});

	it('removes an invalid session cookie', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'expired-session'),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue(null);

		await handle(handleInput(cookies));

		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).toHaveBeenCalledWith(sessionCookieName, { path: '/' });
	});

	it('applies the browser security policies to responses', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue(null);

		const response = await handle(handleInput(cookies));

		expect(response.headers.get('permissions-policy')).toBe(
			'camera=(), geolocation=(), microphone=(), payment=(), usb=()'
		);
		expect(response.headers.get('x-frame-options')).toBe('DENY');
	});

	it('preserves the response-specific CSP generated by SvelteKit', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue(null);
		const contentSecurityPolicy = "default-src 'self'; script-src 'self' 'nonce-response-specific'";

		const response = await handle(
			handleInput(cookies, new Response(null, { headers: { 'content-security-policy': contentSecurityPolicy } }))
		);

		expect(response.headers.get('content-security-policy')).toBe(contentSecurityPolicy);
	});

	it('preserves an explicitly cacheable response when no session cookie changes', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue(null);

		const response = await handle(
			handleInput(cookies, new Response(null, { headers: { 'cache-control': 'public, max-age=60' } }))
		);

		expect(response.headers.get('cache-control')).toBe('public, max-age=60');
	});

	it('prevents caching a response that clears an invalid session cookie', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'expired-session'),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue(null);

		const response = await handle(
			handleInput(cookies, new Response(null, { headers: { 'cache-control': 'public, max-age=60' } }))
		);

		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
