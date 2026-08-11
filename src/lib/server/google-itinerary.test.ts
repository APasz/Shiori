import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	AERODATABOX_API_KEY: undefined as string | undefined,
	AERODATABOX_DIRECT_API_KEY: undefined as string | undefined,
	GOOGLE_PLACES_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { GoogleItineraryImportError, resolveGoogleItineraryUrl } from './google-itinerary';

const selectedFlightUrl =
	'https://www.google.com/travel/flights/booking?tfs=CBwQAhpiEgoyMDI2LTEwLTI3Ih4KA1NZRBIKMjAyNi0xMC0yNxoDS0lYKgJKUTICMTMoAGoNCAISCS9tLzBjaGd6bWoHCAESA1NZRHIMCAISCC9tLzBkcXl3cgwIAxIIL20vMDdkZmsaYhIKMjAyNi0xMS0wNCIeCgNLSVgSCjIwMjYtMTEtMDQaA1NZRCoCSlEyAjE0KABqDAgCEggvbS8wZHF5d2oMCAMSCC9tLzA3ZGZrcg0IAhIJL20vMGNoZ3ptcgcIARIDU1lEQAFIAXABggELCP___________wGYAQE';

afterEach(() => {
	privateEnvironment.AERODATABOX_API_KEY = undefined;
	privateEnvironment.AERODATABOX_DIRECT_API_KEY = undefined;
	privateEnvironment.GOOGLE_PLACES_API_KEY = undefined;
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
				title: 'Essendon, VIC 3040 > Flinders Street, Melbourne VIC 3000',
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
				title: 'Essendon > Flinders Street',
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
				title: 'SYD > KIX',
				suggestedStartDate: '2026-10-27',
				transport: { mode: 'air', operator: 'Jetstar', serviceNumber: 'JQ13' }
			},
			{
				type: 'transport',
				title: 'KIX > SYD',
				suggestedStartDate: '2026-11-04',
				transport: { mode: 'air', operator: 'Jetstar', serviceNumber: 'JQ14' }
			}
		]);
	});

	it('keeps the IATA carrier designator in a Google Flights service number', async () => {
		const tfs = Buffer.from(['PER', '2026-10-27', 'KUL', 'OD', '194'].join('\0')).toString('base64url');

		await expect(
			resolveGoogleItineraryUrl(`https://www.google.com/travel/flights/booking?tfs=${tfs}`)
		).resolves.toEqual([
			expect.objectContaining({
				title: 'PER > KUL',
				transport: { mode: 'air', operator: 'Batik Air Malaysia', serviceNumber: 'OD194' }
			})
		]);
	});

	it('uses Google Places airport names and coordinates for code-only flight imports', async () => {
		const tfs = Buffer.from(['PER', '2026-10-27', 'KUL', 'OD', '194'].join('\0')).toString('base64url');
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							places: [
								{
									displayName: { text: 'Perth Airport' },
									googleMapsUri: 'https://www.google.com/maps/place/Perth+Airport',
									location: { latitude: -31.9403, longitude: 115.9672 },
									primaryType: 'airport'
								}
							]
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							places: [
								{
									displayName: { text: 'Kuala Lumpur International Airport' },
									googleMapsUri: 'https://www.google.com/maps/place/Kuala+Lumpur+International+Airport',
									location: { latitude: 2.7456, longitude: 101.7072 },
									primaryType: 'airport'
								}
							]
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					)
				)
		);

		await expect(
			resolveGoogleItineraryUrl(`https://www.google.com/travel/flights/booking?tfs=${tfs}`)
		).resolves.toEqual([
			expect.objectContaining({
				title: 'Perth > Kuala Lumpur',
				locations: [
					expect.objectContaining({
						coordinates: { latitude: -31.9403, longitude: 115.9672 },
						googleMapsUrl: 'https://www.google.com/maps/place/Perth+Airport',
						name: 'Perth Airport',
						role: 'departure'
					}),
					expect.objectContaining({
						coordinates: { latitude: 2.7456, longitude: 101.7072 },
						googleMapsUrl: 'https://www.google.com/maps/place/Kuala+Lumpur+International+Airport',
						name: 'Kuala Lumpur International Airport',
						role: 'arrival'
					})
				]
			})
		]);
	});

	it('follows a short Google Flights link to its selected itinerary', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('redirect', { status: 302, headers: { location: selectedFlightUrl } }))
		);

		await expect(
			resolveGoogleItineraryUrl('https://www.google.com/travel/flights/s/5oteTevuZPUGQxy77')
		).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ title: 'SYD > KIX' })]));
	});

	it('enriches a selected flight with an exactly route-matched AeroDataBox schedule', async () => {
		const tfs = Buffer.from(['KIX', '2026-11-07', 'SYD', 'JQ', '99'].join('\0')).toString('base64url');
		privateEnvironment.AERODATABOX_API_KEY = 'test-key';
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify([
						{
							number: 'JQ99',
							departure: {
								airport: {
									iata: 'KIX',
									location: { lat: 34.4347, lon: 135.244 },
									name: 'Kansai International Airport',
									timeZone: 'Asia/Tokyo'
								},
								quality: ['Basic'],
								scheduledTime: { local: '2026-11-07 20:45+09:00', utc: '2026-11-07T11:45:00Z' }
							},
							arrival: {
								airport: {
									iata: 'SYD',
									location: { lat: -33.9399, lon: 151.1753 },
									name: 'Sydney Kingsford Smith Airport',
									timeZone: 'Australia/Sydney'
								},
								quality: ['Basic'],
								scheduledTime: { local: '2026-11-08 08:40+11:00', utc: '2026-11-07T21:40:00Z' }
							}
						}
					]),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
		);

		await expect(
			resolveGoogleItineraryUrl(`https://www.google.com/travel/flights/booking?tfs=${tfs}`)
		).resolves.toEqual([
			expect.objectContaining({
				title: 'Kansai > Sydney Kingsford Smith',
				locations: [
					expect.objectContaining({
						googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kansai+International+Airport',
						name: 'Kansai International Airport',
						role: 'departure'
					}),
					expect.objectContaining({
						googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sydney+Kingsford+Smith+Airport',
						name: 'Sydney Kingsford Smith Airport',
						role: 'arrival'
					})
				],
				transport: expect.objectContaining({
					schedule: {
						departure: { scheduledAt: Date.UTC(2026, 10, 7, 11, 45), timeZone: 'Asia/Tokyo' },
						arrival: { scheduledAt: Date.UTC(2026, 10, 7, 21, 40), timeZone: 'Australia/Sydney' }
					}
				})
			})
		]);
	});

	it('rejects unsupported and non-Google links', async () => {
		await expect(resolveGoogleItineraryUrl('https://example.com/flight')).rejects.toBeInstanceOf(
			GoogleItineraryImportError
		);
	});
});
