import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './health/+server';

describe('health route', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns the running release identifier without allowing the response to be cached', async () => {
		vi.stubEnv('SHIORI_RELEASE_ID', 'a'.repeat(40));

		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('x-shiori-release')).toBe('a'.repeat(40));
	});

	it('remains a liveness endpoint when no release identifier is configured', async () => {
		vi.stubEnv('SHIORI_RELEASE_ID', '');

		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(204);
		expect(response.headers.get('x-shiori-release')).toBeNull();
	});
});
