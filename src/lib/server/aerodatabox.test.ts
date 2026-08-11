import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	AERODATABOX_API_KEY: undefined as string | undefined,
	AERODATABOX_DIRECT_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { lookupAeroDataBoxFlightSchedule } from './aerodatabox';

afterEach(() => {
	privateEnvironment.AERODATABOX_API_KEY = undefined;
	privateEnvironment.AERODATABOX_DIRECT_API_KEY = undefined;
	vi.unstubAllGlobals();
});

describe('AeroDataBox flight schedule lookup', () => {
	it('does not make a provider request until an API key is configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			lookupAeroDataBoxFlightSchedule({
				arrivalIata: 'SYD',
				departureIata: 'KIX',
				flightNumber: 'JQ14',
				localDate: '2026-11-04'
			})
		).resolves.toBeNull();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('logs an unsuccessful provider response without exposing the API key', async () => {
		privateEnvironment.AERODATABOX_API_KEY = 'test-key';
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

		await expect(
			lookupAeroDataBoxFlightSchedule({
				arrivalIata: 'SYD',
				departureIata: 'KIX',
				flightNumber: 'JQ16',
				localDate: '2026-11-06'
			})
		).resolves.toBeNull();

		expect(warning).toHaveBeenCalledWith('AeroDataBox flight schedule request failed.', {
			arrivalIata: 'SYD',
			departureIata: 'KIX',
			flightNumber: 'JQ16',
			gateway: 'rapidapi',
			localDate: '2026-11-06',
			responseStatus: 401
		});
		expect(JSON.stringify(warning.mock.calls)).not.toContain('test-key');
	});

	it('returns a schedule only when the provider confirms the full flight route', async () => {
		privateEnvironment.AERODATABOX_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						number: 'JQ 14',
						departure: {
							airport: {
								iata: 'KIX',
								location: { lat: 34.4347, lon: 135.244 },
								name: 'Kansai International Airport',
								timeZone: 'Asia/Tokyo'
							},
							quality: ['Basic'],
							scheduledTime: { local: '2026-11-04 20:45+09:00', utc: '2026-11-04T11:45:00Z' }
						},
						arrival: {
							airport: {
								iata: 'SYD',
								location: { lat: -33.9399, lon: 151.1753 },
								name: 'Sydney Kingsford Smith Airport',
								timeZone: 'Australia/Sydney'
							},
							quality: ['Basic'],
							scheduledTime: { local: '2026-11-05 08:40+11:00', utc: '2026-11-04T21:40:00Z' }
						}
					}
				]),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			lookupAeroDataBoxFlightSchedule({
				arrivalIata: 'SYD',
				departureIata: 'KIX',
				flightNumber: 'JQ14',
				localDate: '2026-11-04'
			})
		).resolves.toEqual({
			departure: {
				coordinates: { latitude: 34.4347, longitude: 135.244 },
				name: 'Kansai International Airport'
			},
			arrival: {
				coordinates: { latitude: -33.9399, longitude: 151.1753 },
				name: 'Sydney Kingsford Smith Airport'
			},
			schedule: {
				departure: { scheduledAt: Date.UTC(2026, 10, 4, 11, 45), timeZone: 'Asia/Tokyo' },
				arrival: { scheduledAt: Date.UTC(2026, 10, 4, 21, 40), timeZone: 'Australia/Sydney' }
			}
		});

		const [requestUrl, requestOptions] = fetchMock.mock.calls[0] ?? [];
		expect(requestUrl).toBe(
			'https://aerodatabox.p.rapidapi.com/flights/Number/JQ14/2026-11-04?dateLocalRole=Departure'
		);
		expect(requestOptions).toMatchObject({
			headers: {
				accept: 'application/json',
				'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
				'X-RapidAPI-Key': 'test-key'
			}
		});
	});

	it('uses the direct gateway when a direct subscription key is configured', async () => {
		privateEnvironment.AERODATABOX_DIRECT_API_KEY = 'direct-test-key';
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			lookupAeroDataBoxFlightSchedule({
				arrivalIata: 'SYD',
				departureIata: 'KIX',
				flightNumber: 'JQ17',
				localDate: '2026-11-07'
			})
		).resolves.toBeNull();

		const [requestUrl, requestOptions] = fetchMock.mock.calls[0] ?? [];
		expect(requestUrl).toBe('https://api.aerodatabox.com/flights/Number/JQ17/2026-11-07?dateLocalRole=Departure');
		expect(requestOptions).toMatchObject({
			headers: { accept: 'application/json', 'X-Api-Key': 'direct-test-key' }
		});
	});

	it('rejects approximate, route-mismatched, and ambiguous provider responses', async () => {
		privateEnvironment.AERODATABOX_API_KEY = 'test-key';
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify([
						{
							number: 'JQ15',
							departure: {
								airport: { iata: 'KIX', name: 'Kansai', timeZone: 'Asia/Tokyo' },
								quality: ['Approximate'],
								scheduledTime: { local: '2026-11-05 20:45+09:00', utc: '2026-11-05T11:45:00Z' }
							},
							arrival: {
								airport: { iata: 'SYD', name: 'Sydney', timeZone: 'Australia/Sydney' },
								quality: ['Basic'],
								scheduledTime: { local: '2026-11-06 08:40+11:00', utc: '2026-11-05T21:40:00Z' }
							}
						}
					]),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
		);

		await expect(
			lookupAeroDataBoxFlightSchedule({
				arrivalIata: 'SYD',
				departureIata: 'KIX',
				flightNumber: 'JQ15',
				localDate: '2026-11-05'
			})
		).resolves.toBeNull();
	});
});
