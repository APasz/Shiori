import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultColourway } from '$lib/theme/colourway';
import { maximumAccountRequestBytes } from './request-size';

let dataDirectory = '';

function formRequest(url: string, formData: FormData): Request {
	return new Request(url, {
		body: formData,
		headers: { 'content-length': '1024' },
		method: 'POST'
	});
}

beforeEach(async () => {
	dataDirectory = await mkdtemp(join(tmpdir(), 'shiori-accounts-route-test-'));
	process.env.SHIORI_DATA_DIRECTORY = dataDirectory;
	vi.resetModules();
});

afterEach(async () => {
	delete process.env.SHIORI_DATA_DIRECTORY;
	await rm(dataDirectory, { force: true, recursive: true });
});

describe('account actions', () => {
	it('lets every signed-in user manage their own account', async () => {
		const store = await import('$lib/server/store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const member = await store.createAccount({
			actorId: sudo.id,
			password: 'member strong test password',
			username: 'member'
		});
		const sudoSession = { ...sudo, colourway: defaultColourway };
		const memberSession = { ...member, colourway: defaultColourway };
		const { actions, load } = await import('../../routes/account/+page.server');
		const usernameForm = new FormData();
		usernameForm.set('username', 'renamed-member');

		await expect(
			load({ locals: { user: memberSession }, url: new URL('http://localhost/account?tab=account') } as never)
		).resolves.toMatchObject({
			canManageAccounts: false,
			currentUser: memberSession,
			selectedTab: 'account'
		});
		const sudoAccountPage = await load({
			locals: { user: sudoSession },
			url: new URL('http://localhost/account?tab=administration')
		} as never);
		expect(sudoAccountPage).toMatchObject({
			administration: {
				accounts: [
					{ id: member.id, ownsTrip: false, role: 'none', username: member.username },
					{ id: sudo.id, ownsTrip: false, role: 'none', username: sudo.username }
				],
				selectedTrip: null,
				trips: []
			},
			canManageAccounts: true,
			currentUser: sudoSession,
			selectedTab: 'administration'
		});
		await expect(
			load({ locals: { user: memberSession }, url: new URL('http://localhost/account?tab=administration') } as never)
		).resolves.toMatchObject({
			administration: null,
			selectedTab: 'appearance'
		});
		await expect(
			load({ locals: { user: memberSession }, url: new URL('http://localhost/account?tab=unknown') } as never)
		).resolves.toMatchObject({
			selectedTab: 'appearance'
		});
		await expect(
			actions.changeUsername({
				locals: { user: memberSession },
				request: formRequest('http://localhost/account', usernameForm)
			} as never)
		).resolves.toEqual({ usernameUpdated: 'renamed-member' });

		const colourwayForm = new FormData();
		colourwayForm.set('colourway', 'violet');
		const colourwayLocals = { user: { ...memberSession, username: 'renamed-member' } };
		await expect(
			actions.changeColourway({
				locals: colourwayLocals,
				request: formRequest('http://localhost/account', colourwayForm)
			} as never)
		).resolves.toEqual({ colourwayUpdated: 'violet' });
		expect(colourwayLocals.user).toEqual({ colourway: 'violet', id: member.id, username: 'renamed-member' });

		const passwordForm = new FormData();
		passwordForm.set('currentPassword', 'member strong test password');
		passwordForm.set('newPassword', 'replacement member test password');
		passwordForm.set('newPasswordConfirmation', 'replacement member test password');
		const cookies = { set: vi.fn() };
		await expect(
			actions.changePassword({
				cookies,
				locals: { user: { colourway: 'violet', id: member.id, username: 'renamed-member' } },
				request: formRequest('http://localhost/account', passwordForm),
				url: new URL('http://localhost/account')
			} as never)
		).resolves.toEqual({ passwordChanged: true });

		await expect(store.authenticate('renamed-member', 'replacement member test password')).resolves.toEqual({
			id: member.id,
			username: 'renamed-member'
		});
		expect(cookies.set).toHaveBeenCalledWith(
			'shiori_session',
			expect.any(String),
			expect.objectContaining({ httpOnly: true, path: '/' })
		);

		const sessionId = await store.createSession(member.id);
		await expect(store.refreshSession(sessionId)).resolves.toMatchObject({
			user: { colourway: 'violet', id: member.id, username: 'renamed-member' }
		});
	});

	it('rejects oversized self-service account requests before parsing them', async () => {
		const store = await import('$lib/server/store');
		const user = { ...(await store.createInitialSudo('sudo', 'a strong test password')), colourway: defaultColourway };
		const { actions } = await import('../../routes/account/+page.server');
		const request = new Request('http://localhost/account', {
			headers: { 'content-length': `${maximumAccountRequestBytes + 1}` },
			method: 'POST'
		});

		await expect(actions.changeUsername({ locals: { user }, request } as never)).resolves.toMatchObject({
			data: { usernameError: 'The username update request is too large.' },
			status: 413
		});
		await expect(actions.changePassword({ locals: { user }, request } as never)).resolves.toMatchObject({
			data: { passwordError: 'The password update request is too large.' },
			status: 413
		});
		await expect(actions.changeColourway({ locals: { user }, request } as never)).resolves.toMatchObject({
			data: { colourwayError: 'The colour update request is too large.' },
			status: 413
		});
	});

	it('rejects oversized administration account requests before parsing them', async () => {
		const store = await import('$lib/server/store');
		const owner = await store.createInitialSudo('sudo', 'a strong test password');
		const trip = await store.createTrip({ details: { title: 'Test trip', timeZone: 'UTC' }, ownerId: owner.id });
		const { actions } = await import('../../routes/account/+page.server');
		const oversizedRequest = (): Request =>
			new Request('http://localhost/account', {
				headers: { 'content-length': `${maximumAccountRequestBytes + 1}` },
				method: 'POST'
			});

		await expect(
			actions.createAccount({ locals: { user: owner }, request: oversizedRequest() } as never)
		).resolves.toMatchObject({
			data: { createAccountError: 'The account creation request is too large.' },
			status: 413
		});
		await expect(
			actions.resetPassword({ locals: { user: owner }, request: oversizedRequest() } as never)
		).resolves.toMatchObject({
			data: { passwordResetError: 'The password reset request is too large.' },
			status: 413
		});
		await expect(
			actions.setTripAccess({
				locals: { user: owner },
				request: oversizedRequest(),
				url: new URL(`http://localhost/account?tab=administration&trip=${trip.slug}`)
			} as never)
		).resolves.toMatchObject({
			data: { memberAccessError: 'The trip access request is too large.' },
			status: 413
		});
		await expect(
			actions.deleteAccount({ locals: { user: owner }, request: oversizedRequest() } as never)
		).resolves.toMatchObject({
			data: { accountDeletionError: 'The account deletion request is too large.' },
			status: 413
		});
	});

	it('rejects an unsupported colourway', async () => {
		const store = await import('$lib/server/store');
		const user = { ...(await store.createInitialSudo('sudo', 'a strong test password')), colourway: defaultColourway };
		const { actions } = await import('../../routes/account/+page.server');
		const formData = new FormData();
		formData.set('colourway', 'unknown');

		await expect(
			actions.changeColourway({
				locals: { user },
				request: formRequest('http://localhost/account', formData)
			} as never)
		).resolves.toMatchObject({
			data: { colourwayError: expect.any(String) },
			status: 400
		});
	});

	it('creates an account through its named action', async () => {
		const store = await import('$lib/server/store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		await store.createTrip({ details: { title: 'Test trip', timeZone: 'UTC' }, ownerId: owner.id });
		const { actions } = await import('../../routes/account/+page.server');
		const formData = new FormData();
		formData.set('username', 'member');
		formData.set('password', 'a second strong test password');

		expect(actions).not.toHaveProperty('default');
		const result = await actions.createAccount({
			locals: { user: owner },
			request: formRequest('http://localhost/account?tab=administration', formData)
		} as never);

		expect(result).toEqual({ createdAccount: 'member' });
		await expect(store.authenticate('member', 'a second strong test password')).resolves.toEqual({
			id: expect.any(String),
			username: 'member'
		});
	});

	it('shows global account management in the sudo-only Administration tab without an owned trip', async () => {
		const store = await import('$lib/server/store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const { load } = await import('../../routes/account/+page.server');

		await expect(
			load({ locals: { user: sudo }, url: new URL('http://localhost/account?tab=administration') } as never)
		).resolves.toMatchObject({
			administration: {
				accounts: [{ id: sudo.id, role: 'none', username: sudo.username }],
				selectedTrip: null,
				trips: []
			}
		});
	});
});
