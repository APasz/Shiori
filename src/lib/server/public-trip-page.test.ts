import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicTripCacheControl } from './public-cache';

const needsInitialSetup = vi.hoisted(() => vi.fn());
const getTripView = vi.hoisted(() => vi.fn());
const ownsAnyTrip = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/store/auth', () => ({ needsInitialSetup }));
vi.mock('$lib/server/store/trips', () => ({ getTripView, ownsAnyTrip }));

import { load } from '../../routes/trips/[slug]/+page.server';

const publicTripView = {
	access: 'visitor',
	canEdit: false,
	id: 'trip-id',
	isPublic: true,
	itinerary: { items: [], timeZone: 'UTC', title: 'Public trip' },
	revision: 1,
	slug: 'public-trip'
} as const;

describe('public trip page', () => {
	beforeEach(() => {
		needsInitialSetup.mockReset().mockResolvedValue(false);
		getTripView.mockReset().mockResolvedValue(publicTripView);
		ownsAnyTrip.mockReset();
	});

	it('permits shared caching for an anonymous public visitor', async () => {
		const setHeaders = vi.fn();

		await expect(
			load({ locals: { user: null }, params: { slug: publicTripView.slug }, setHeaders } as never)
		).resolves.toMatchObject({ currentUser: null, trip: publicTripView });

		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': publicTripCacheControl, vary: 'Cookie' });
	});

	it('does not cache the visitor view when a user is signed in', async () => {
		const setHeaders = vi.fn();

		await load({
			locals: { user: { id: 'user-id', username: 'member' } },
			params: { slug: publicTripView.slug },
			setHeaders
		} as never);

		expect(setHeaders).not.toHaveBeenCalled();
	});
});
