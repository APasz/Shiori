import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverMetricsSchema } from '$lib/server-metrics';

let dataDirectory = '';

beforeEach(async () => {
	dataDirectory = await mkdtemp(join(tmpdir(), 'shiori-admin-metrics-test-'));
	process.env.SHIORI_DATA_DIRECTORY = dataDirectory;
	vi.resetModules();
});

afterEach(async () => {
	delete process.env.SHIORI_DATA_DIRECTORY;
	await rm(dataDirectory, { force: true, recursive: true });
});

describe('admin metrics route', () => {
	it('requires a signed-in sudo user and returns an uncached metrics snapshot', async () => {
		const store = await import('$lib/server/store');
		const sudo = await store.createInitialSudo('sudo', 'a strong test password');
		const member = await store.createAccount({
			actorId: sudo.id,
			password: 'a different strong test password',
			username: 'member'
		});
		const { GET } = await import('./metrics/+server');

		const anonymousResponse = await GET({ locals: { user: null } } as never);
		expect(anonymousResponse.status).toBe(401);
		expect(anonymousResponse.headers.get('cache-control')).toBe('no-store');

		const memberResponse = await GET({ locals: { user: member } } as never);
		expect(memberResponse.status).toBe(403);
		expect(memberResponse.headers.get('cache-control')).toBe('no-store');

		const sudoResponse = await GET({ locals: { user: sudo } } as never);
		expect(sudoResponse.status).toBe(200);
		expect(sudoResponse.headers.get('cache-control')).toBe('no-store');
		expect(serverMetricsSchema.safeParse(await sudoResponse.json()).success).toBe(true);
	});
});
