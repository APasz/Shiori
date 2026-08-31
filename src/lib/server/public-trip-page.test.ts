import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicTripCacheControl } from './public-cache';

const needsInitialSetup = vi.hoisted(() => vi.fn());
const getTripPageView = vi.hoisted(() => vi.fn());
const isSudoUser = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/store/auth', () => ({ isSudoUser, needsInitialSetup }));
vi.mock('$lib/server/store/trips', () => ({ getTripPageView }));

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
const publicTripPage = {
	sourceItinerary: { items: [], timeZone: 'UTC', title: 'Public trip' },
	trip: publicTripView
} as const;

describe('public trip page', () => {
	beforeEach(() => {
		needsInitialSetup.mockReset().mockResolvedValue(false);
		getTripPageView.mockReset().mockResolvedValue(publicTripPage);
		isSudoUser.mockReset().mockResolvedValue(false);
	});

	it('permits shared caching for an anonymous public visitor', async () => {
		const setHeaders = vi.fn();

		const page = await load({
			locals: { user: null },
			params: { slug: publicTripView.slug },
			setHeaders
		} as never);

		expect(page).toMatchObject({
			currentUser: null,
			openGraphDescription: 'Public trip: 0 days',
			trip: publicTripView
		});
		expect(page).not.toHaveProperty('sourceItinerary');

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
