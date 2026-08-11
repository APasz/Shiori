import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGoogleMapsUrl } from '../itinerary/schema';
import {
	GoogleMapsResolveError,
	googleMapsDirectionsCoordinates,
	googleMapsSearchUrl,
	parseGoogleMapsLocationUrl,
	resolveGoogleMapsLocation
} from './google-maps';

const melbourneAirportUrl =
	'https://www.google.com/maps/place/Melbourne+Airport/@-37.7332209,144.8645358,27101m/data=!3m1!1e3!4m6!3m5!1s0x6ad659a9ebaa3917:0xf045676052ff090!8m2!3d-37.6708228!4d144.8429763!16zL20vMDFuZmx3';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Google Maps location parsing', () => {
	it('creates a Google Maps search URL for a location name', () => {
		expect(googleMapsSearchUrl('Kansai International Airport')).toBe(
			'https://www.google.com/maps/search/?api=1&query=Kansai+International+Airport'
		);
	});

	it('prefers place coordinates over the map viewport and reads the place name', () => {
		const result = parseGoogleMapsLocationUrl(new URL(melbourneAirportUrl));

		expect(result.name).toBe('Melbourne Airport');
		expect(result.coordinates).toEqual({ latitude: -37.6708228, longitude: 144.8429763 });
	});

	it('reads coordinate-query links without mistaking map viewports for places', () => {
		expect(parseGoogleMapsLocationUrl(new URL('https://maps.google.com/?q=-37.6708228,144.8429763'))).toMatchObject({
			coordinates: { latitude: -37.6708228, longitude: 144.8429763 }
		});

		expect(parseGoogleMapsLocationUrl(new URL('https://www.google.com/maps/place/Cafe/@-37.814,144.963,15z'))).toEqual({
			googleMapsUrl: 'https://www.google.com/maps/place/Cafe/@-37.814,144.963,15z',
			name: 'Cafe'
		});
	});

	it('reads embedded direction endpoint coordinates without using the map viewport', () => {
		const directionsUrl = new URL(
			'https://www.google.com/maps/dir/KL+Sentral/JB+Sentral/@2.2978148,101.4035567,875812m/data=!4m8!1m2!1d101.6860377!2d3.1341631!1m2!1d103.7621742!2d1.4633316'
		);

		expect(googleMapsDirectionsCoordinates(directionsUrl)).toEqual({
			arrival: { latitude: 1.4633316, longitude: 103.7621742 },
			departure: { latitude: 3.1341631, longitude: 101.6860377 }
		});
	});

	it('accepts short and regional Google Maps URLs but rejects unrelated Google pages', () => {
		expect(isGoogleMapsUrl('https://maps.app.goo.gl/KKWKSZ7XFAP4v8y28')).toBe(true);
		expect(isGoogleMapsUrl('https://www.google.com.au/maps/place/Melbourne+Airport')).toBe(true);
		expect(isGoogleMapsUrl('https://www.google.com/search?q=Melbourne+Airport')).toBe(false);

		expect(() => parseGoogleMapsLocationUrl(new URL('https://example.com/?q=-37,144'))).toThrow(GoogleMapsResolveError);
	});

	it('follows Google-only redirects before parsing the resolved Maps URL', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('redirect', {
					status: 302,
					headers: { location: melbourneAirportUrl }
				})
			)
			.mockResolvedValueOnce(new Response('map page', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(resolveGoogleMapsLocation('https://maps.app.goo.gl/KKWKSZ7XFAP4v8y28')).resolves.toMatchObject({
			coordinates: { latitude: -37.6708228, longitude: 144.8429763 },
			name: 'Melbourne Airport'
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('rejects unsafe redirects and Google Maps network failures', async () => {
		const unsafeRedirectFetch = vi.fn().mockResolvedValue(
			new Response('redirect', {
				status: 302,
				headers: { location: 'https://example.com/location' }
			})
		);
		vi.stubGlobal('fetch', unsafeRedirectFetch);

		await expect(resolveGoogleMapsLocation('https://maps.app.goo.gl/KKWKSZ7XFAP4v8y28')).rejects.toMatchObject({
			status: 400
		});
		expect(unsafeRedirectFetch).toHaveBeenCalledTimes(1);

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
		await expect(resolveGoogleMapsLocation('https://maps.app.goo.gl/KKWKSZ7XFAP4v8y28')).rejects.toMatchObject({
			status: 502
		});
	});
});
