import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dataDirectory = '';

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
	it('creates an account through its named action', async () => {
		const store = await import('$lib/server/store');
		const owner = await store.createInitialSudo('owner', 'a strong test password');
		await store.createTrip({ details: { title: 'Test trip', timeZone: 'UTC' }, ownerId: owner.id });
		const { actions } = await import('../../routes/accounts/+page.server');
		const formData = new FormData();
		formData.set('username', 'member');
		formData.set('password', 'a second strong test password');

		expect(actions).not.toHaveProperty('default');
		const result = await actions.createAccount({
			locals: { user: owner },
			request: new Request('http://localhost/accounts', { body: formData, method: 'POST' })
		} as never);

		expect(result).toEqual({ createdAccount: 'member' });
		await expect(store.authenticate('member', 'a second strong test password')).resolves.toEqual({
			id: expect.any(String),
			username: 'member'
		});
	});

	it('allows the sudo user to manage global accounts without owning a trip', async () => {
		const store = await import('$lib/server/store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const { load } = await import('../../routes/accounts/+page.server');

		await expect(
			load({ locals: { user: sudo }, url: new URL('http://localhost/accounts') } as never)
		).resolves.toMatchObject({
			accounts: [{ id: sudo.id, role: 'none', username: sudo.username }],
			selectedTrip: null,
			trips: []
		});
	});
});
