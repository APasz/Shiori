import { describe, expect, it } from 'vitest';
import { GET } from '../../routes/api/offline/viewer/+server';

describe('offline viewer endpoint', () => {
	it('returns the public cache partition for anonymous visitors', async () => {
		const response = await GET({ locals: { user: null } } as never);

		expect(response.headers.get('cache-control')).toBe('no-store');
		await expect(response.json()).resolves.toEqual({ viewerId: 'public' });
	});

	it('returns the signed-in account ID for authenticated users', async () => {
		const response = await GET({ locals: { user: { id: 'user-1', username: 'owner' } } } as never);

		await expect(response.json()).resolves.toEqual({ viewerId: 'user-1' });
	});
});
