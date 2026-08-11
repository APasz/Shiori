import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	GOOGLE_ROUTES_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { lookupGoogleTransitLegs } from './google-transit';

const lookup = {
	arrivalAddress: 'JB Sentral, Johor Bahru, Malaysia',
	departureAddress: 'KL Sentral, Kuala Lumpur, Malaysia',
	timing: { at: Date.UTC(2026, 9, 27, 10), kind: 'departure' as const }
};

function transitRouteResponse(timeZone = 'Asia/Kuala_Lumpur'): Response {
	return new Response(
		JSON.stringify({
			routes: [
				{
					legs: [
						{
							steps: [
								{},
								{
									transitDetails: {
										localizedValues: {
											arrivalTime: { timeZone },
											departureTime: { timeZone }
										},
										stopDetails: {
											arrivalStop: {
												location: { latLng: { latitude: 1.4632, longitude: 103.7646 } },
												name: 'JB Sentral'
											},
											arrivalTime: '2026-10-27T14:30:00Z',
											departureStop: {
												location: { latLng: { latitude: 3.1342, longitude: 101.686 } },
												name: 'KL Sentral'
											},
											departureTime: '2026-10-27T10:00:00Z'
										},
										transitLine: {
											agencies: [{ name: 'KTM Berhad' }],
											name: 'KTM ETS',
											nameShort: 'ETS 9321',
											vehicle: { type: 'LONG_DISTANCE_TRAIN' }
										}
									}
								}
							]
						}
					]
				}
			]
		}),
		{ headers: { 'content-type': 'application/json' } }
	);
}

afterEach(() => {
	privateEnvironment.GOOGLE_ROUTES_API_KEY = undefined;
	vi.unstubAllGlobals();
});

describe('Google Routes transit lookup', () => {
	it('does not make a provider request until an API key is configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(lookupGoogleTransitLegs(lookup)).resolves.toBeNull();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a scheduled transit leg with the service, operator, stops, and rail mode', async () => {
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(transitRouteResponse());
		vi.stubGlobal('fetch', fetchMock);

		await expect(lookupGoogleTransitLegs(lookup)).resolves.toEqual([
			{
				arrival: { coordinates: { latitude: 1.4632, longitude: 103.7646 }, name: 'JB Sentral' },
				departure: { coordinates: { latitude: 3.1342, longitude: 101.686 }, name: 'KL Sentral' },
				mode: 'rail',
				operator: 'KTM Berhad',
				schedule: {
					arrival: { scheduledAt: Date.UTC(2026, 9, 27, 14, 30), timeZone: 'Asia/Kuala_Lumpur' },
					departure: { scheduledAt: Date.UTC(2026, 9, 27, 10), timeZone: 'Asia/Kuala_Lumpur' }
				},
				serviceNumber: 'ETS 9321'
			}
		]);

		const [requestUrl, requestOptions] = fetchMock.mock.calls[0] ?? [];
		expect(requestUrl).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
		expect(requestOptions).toMatchObject({
			body: JSON.stringify({
				destination: { address: lookup.arrivalAddress },
				departureTime: '2026-10-27T10:00:00.000Z',
				origin: { address: lookup.departureAddress },
				travelMode: 'TRANSIT'
			}),
			headers: {
				'content-type': 'application/json',
				'X-Goog-Api-Key': 'test-key',
				'X-Goog-FieldMask': 'routes.legs.steps.transitDetails'
			},
			method: 'POST'
		});
	});

	it('uses an arrival timestamp without also setting a departure timestamp', async () => {
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(transitRouteResponse());
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			lookupGoogleTransitLegs({
				...lookup,
				timing: { at: Date.UTC(2026, 9, 27, 14, 30), kind: 'arrival' }
			})
		).resolves.toEqual([expect.objectContaining({ mode: 'rail' })]);

		const [, requestOptions] = fetchMock.mock.calls[0] ?? [];
		expect(requestOptions).toMatchObject({
			body: JSON.stringify({
				destination: { address: lookup.arrivalAddress },
				arrivalTime: '2026-10-27T14:30:00.000Z',
				origin: { address: lookup.departureAddress },
				travelMode: 'TRANSIT'
			})
		});
	});

	it('retains a transit leg when its response has no usable source time zone', async () => {
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'test-key';
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(transitRouteResponse('Invalid/TimeZone')));

		const transitLegs = await lookupGoogleTransitLegs({
			...lookup,
			timing: { at: Date.UTC(2026, 9, 28, 10), kind: 'departure' }
		});

		expect(transitLegs).toEqual([
			expect.objectContaining({
				mode: 'rail',
				operator: 'KTM Berhad',
				serviceNumber: 'ETS 9321'
			})
		]);
		expect(transitLegs?.[0]).not.toHaveProperty('schedule');
	});
});
