import { describe, expect, it } from 'vitest';
import { tripOpenGraphMetadata } from './open-graph';

const publicDescription = 'Public trip: 5 days\n25th Oct 2026 AEDT >>> 5th Nov 2026 AEDT';

describe('tripOpenGraphMetadata', () => {
	it('creates a canonical public itinerary preview', () => {
		expect(
			tripOpenGraphMetadata(
				{ description: publicDescription, tripTitle: 'Birthday 30' },
				new URL('https://shiori.example/trips/birthday30?source=discord#schedule')
			)
		).toEqual({
			description: publicDescription,
			siteName: 'Shiori',
			title: 'Shiori Itinerary: Birthday 30',
			type: 'website',
			url: 'https://shiori.example/trips/birthday30'
		});
	});

	it('uses the supplied private description', () => {
		expect(
			tripOpenGraphMetadata(
				{ description: 'Private trip: sign-in required', tripTitle: 'Birthday 30' },
				new URL('https://shiori.example/trips/birthday30')
			)
		).toMatchObject({
			description: 'Private trip: sign-in required',
			title: 'Shiori Itinerary: Birthday 30'
		});
	});
});
