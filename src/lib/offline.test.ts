import { describe, expect, it } from 'vitest';
import { tripOfflineUrls } from './offline';

describe('offline trip URLs', () => {
	it('includes the itinerary, notes, and costs pages for a trip', () => {
		expect(tripOfflineUrls(new URL('https://shiori.example/trips/japan-2026/notes'))).toEqual([
			'https://shiori.example/trips/japan-2026',
			'https://shiori.example/trips/japan-2026/notes',
			'https://shiori.example/trips/japan-2026/costs'
		]);
	});

	it('does not prepare non-trip routes for offline storage', () => {
		expect(tripOfflineUrls(new URL('https://shiori.example/settings/access'))).toEqual([]);
	});
});
