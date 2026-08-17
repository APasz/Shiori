import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionCookieName, sessionLifetimeSeconds } from '$lib/server/session';

const refreshSession = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/store/sessions', () => ({ refreshSession }));

import { handle } from './hooks.server';

type HandleInput = Parameters<typeof handle>[0];
type TestCookies = {
	delete: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
};

function handleInput(cookies: TestCookies): HandleInput {
	return {
		event: {
			cookies,
			locals: {},
			url: new URL('https://shiori.example/')
		} as unknown as HandleInput['event'],
		resolve: async () => new Response()
	};
}

describe('server hook', () => {
	beforeEach(() => {
		refreshSession.mockReset();
	});

	it('refreshes the browser cookie when the authenticated session is renewed', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'active-session'),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue({ renewed: true, user: { id: 'user-1', username: 'owner' } });

		await handle(handleInput(cookies));

		expect(refreshSession).toHaveBeenCalledWith('active-session');
		expect(cookies.set).toHaveBeenCalledWith(sessionCookieName, 'active-session', {
			httpOnly: true,
			maxAge: sessionLifetimeSeconds,
			path: '/',
			sameSite: 'lax',
			secure: true
		});
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('does not refresh the browser cookie before session renewal is due', async () => {
		const cookies: TestCookies = {
			delete: vi.fn(),
			get: vi.fn(() => 'active-session'),
			set: vi.fn()
		};
		refreshSession.mockResolvedValue({ renewed: false, user: { id: 'user-1', username: 'owner' } });

		await handle(handleInput(cookies));

		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
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
});
