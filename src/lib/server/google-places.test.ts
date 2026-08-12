import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	GOOGLE_PLACES_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { lookupGoogleAirport, lookupGoogleMapsPlace } from './google-places';

afterEach(() => {
	privateEnvironment.GOOGLE_PLACES_API_KEY = undefined;
	vi.unstubAllGlobals();
});

describe('Google Places airport lookup', () => {
	it('does not make a provider request until an API key is configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(lookupGoogleAirport('PER')).resolves.toBeNull();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uses a type-filtered text search to resolve airport names and coordinates', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(
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
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(lookupGoogleAirport('per')).resolves.toEqual({
			coordinates: { latitude: -31.9403, longitude: 115.9672 },
			googleMapsUrl: 'https://www.google.com/maps/place/Perth+Airport',
			name: 'Perth Airport',
			primaryType: 'airport'
		});

		const [requestUrl, requestOptions] = fetchMock.mock.calls[0] ?? [];
		expect(requestUrl).toBe('https://places.googleapis.com/v1/places:searchText');
		expect(requestOptions).toMatchObject({
			body: JSON.stringify({
				includedType: 'airport',
				pageSize: 2,
				strictTypeFiltering: true,
				textQuery: 'IATA PER airport'
			}),
			headers: {
				'content-type': 'application/json',
				'X-Goog-Api-Key': 'test-key',
				'X-Goog-FieldMask':
					'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location,places.primaryType,places.timeZone'
			},
			method: 'POST'
		});
	});

	it('returns a Maps place address only when the place name and coordinates agree', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					places: [
						{
							displayName: { text: 'ELE Hotel 樟葉' },
							formattedAddress: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan',
							location: { latitude: 34.8627692, longitude: 135.6777082 }
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			lookupGoogleMapsPlace({
				coordinates: { latitude: 34.8627692, longitude: 135.6777082 },
				name: 'ELE Hotel 樟葉'
			})
		).resolves.toMatchObject({
			address: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan',
			name: 'ELE Hotel 樟葉'
		});

		const [, requestOptions] = fetchMock.mock.calls[0] ?? [];
		expect(requestOptions).toMatchObject({
			body: JSON.stringify({
				locationBias: {
					circle: {
						center: { latitude: 34.8627692, longitude: 135.6777082 },
						radius: 100
					}
				},
				pageSize: 1,
				textQuery: 'ELE Hotel 樟葉'
			})
		});
	});

	it('rejects a response that is ambiguous or not typed as an airport', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						places: [
							{ displayName: { text: 'Sydney Airport' }, primaryType: 'airport' },
							{ displayName: { text: 'Sydney West Airport' }, primaryType: 'airport' }
						]
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
		);

		await expect(lookupGoogleAirport('SYD')).resolves.toBeNull();
		expect(warning).toHaveBeenCalledWith('Google Places did not return a usable airport location.', {
			airportCode: 'SYD'
		});
	});

	it('coalesces duplicate lookups without sharing a consumed response body', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		let completeResponse: (response: Response) => void = () => undefined;
		const response = new Promise<Response>((resolve) => {
			completeResponse = resolve;
		});
		const fetchMock = vi.fn().mockReturnValue(response);
		vi.stubGlobal('fetch', fetchMock);

		const first = lookupGoogleAirport('MEL');
		const second = lookupGoogleAirport('mel');

		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		completeResponse(
			new Response(
				JSON.stringify({
					places: [{ displayName: { text: 'Melbourne Airport' }, primaryType: 'airport' }]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		await expect(Promise.all([first, second])).resolves.toEqual([
			{ name: 'Melbourne Airport', primaryType: 'airport' },
			{ name: 'Melbourne Airport', primaryType: 'airport' }
		]);
	});
});
