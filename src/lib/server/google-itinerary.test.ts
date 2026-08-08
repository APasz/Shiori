import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleItineraryImportError, resolveGoogleItineraryUrl } from './google-itinerary';

const selectedFlightUrl =
	'https://www.google.com/travel/flights/booking?tfs=CBwQAhpiEgoyMDI2LTEwLTI3Ih4KA1NZRBIKMjAyNi0xMC0yNxoDS0lYKgJKUTICMTMoAGoNCAISCS9tLzBjaGd6bWoHCAESA1NZRHIMCAISCC9tLzBkcXl3cgwIAxIIL20vMDdkZmsaYhIKMjAyNi0xMS0wNCIeCgNLSVgSCjIwMjYtMTEtMDQaA1NZRCoCSlEyAjE0KABqDAgCEggvbS8wZHF5d2oMCAMSCC9tLzA3ZGZrcg0IAhIJL20vMGNoZ3ptcgcIARIDU1lEQAFIAXABggELCP___________wGYAQE';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Google itinerary import', () => {
	it('imports a Google Maps directions link as transport', async () => {
		const result = await resolveGoogleItineraryUrl(
			'https://www.google.com/maps/dir/Essendon,+VIC+3040/Flinders+Street,+Melbourne+VIC+3000?travelmode=driving'
		);

		expect(result).toEqual([
			expect.objectContaining({
				type: 'transport',
				title: 'Travel from Essendon, VIC 3040 to Flinders Street, Melbourne VIC 3000',
				transport: { mode: 'car' },
				locations: [
					expect.objectContaining({ name: 'Essendon, VIC 3040', role: 'departure' }),
					expect.objectContaining({ name: 'Flinders Street, Melbourne VIC 3000', role: 'arrival' })
				]
			})
		]);
	});

	it('imports query-form directions links', async () => {
		await expect(
			resolveGoogleItineraryUrl(
				'https://www.google.com/maps/dir/?api=1&origin=Essendon&destination=Flinders+Street&dirflg=d'
			)
		).resolves.toMatchObject([
			expect.objectContaining({
				title: 'Travel from Essendon to Flinders Street',
				transport: { mode: 'car' }
			})
		]);
	});

	it('imports a Google Maps place as an activity', async () => {
		await expect(
			resolveGoogleItineraryUrl('https://www.google.com/maps/place/Flinders+Street+Station')
		).resolves.toMatchObject([
			expect.objectContaining({
				type: 'activity',
				title: 'Flinders Street Station',
				locations: [expect.objectContaining({ name: 'Flinders Street Station', role: 'primary' })]
			})
		]);
	});

	it('rejects walking directions instead of creating an itinerary transport item', async () => {
		await expect(
			resolveGoogleItineraryUrl('https://www.google.com/maps/dir/Essendon/Flinders+Street?travelmode=walking')
		).rejects.toMatchObject({ status: 422 });
	});

	it('resolves a short Google Maps link before importing directions', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response('redirect', {
						status: 302,
						headers: {
							location: 'https://www.google.com/maps/dir/Essendon/Flinders+Street?travelmode=driving'
						}
					})
				)
				.mockResolvedValueOnce(new Response('map page', { status: 200 }))
		);

		await expect(resolveGoogleItineraryUrl('https://maps.app.goo.gl/sLVj4QZsqzHRQThT6')).resolves.toMatchObject([
			{ type: 'transport', transport: { mode: 'car' } }
		]);
	});

	it('imports separate flight legs from a selected Google Flights URL', async () => {
		await expect(resolveGoogleItineraryUrl(selectedFlightUrl)).resolves.toMatchObject([
			{
				type: 'transport',
				title: 'JQ13 from SYD to KIX',
				suggestedStartDate: '2026-10-27',
				transport: { mode: 'air', operator: 'Jetstar', serviceNumber: '13' }
			},
			{
				type: 'transport',
				title: 'JQ14 from KIX to SYD',
				suggestedStartDate: '2026-11-04',
				transport: { mode: 'air', operator: 'Jetstar', serviceNumber: '14' }
			}
		]);
	});

	it('follows a short Google Flights link to its selected itinerary', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('redirect', { status: 302, headers: { location: selectedFlightUrl } }))
		);

		await expect(
			resolveGoogleItineraryUrl('https://www.google.com/travel/flights/s/5oteTevuZPUGQxy77')
		).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ title: 'JQ13 from SYD to KIX' })]));
	});

	it('rejects unsupported and non-Google links', async () => {
		await expect(resolveGoogleItineraryUrl('https://example.com/flight')).rejects.toBeInstanceOf(
			GoogleItineraryImportError
		);
	});
});
