import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	AERODATABOX_API_KEY: undefined as string | undefined,
	AERODATABOX_DIRECT_API_KEY: undefined as string | undefined,
	GOOGLE_PLACES_API_KEY: undefined as string | undefined,
	GOOGLE_ROUTES_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { GoogleItineraryImportError, resolveGoogleItineraryUrl } from './google-itinerary';
import { parseGoogleHotelsSearch } from './google-hotels';

const selectedFlightUrl =
	'https://www.google.com/travel/flights/booking?tfs=CBwQAhpiEgoyMDI2LTEwLTI3Ih4KA1NZRBIKMjAyNi0xMC0yNxoDS0lYKgJKUTICMTMoAGoNCAISCS9tLzBjaGd6bWoHCAESA1NZRHIMCAISCC9tLzBkcXl3cgwIAxIIL20vMDdkZmsaYhIKMjAyNi0xMS0wNCIeCgNLSVgSCjIwMjYtMTEtMDQaA1NZRCoCSlEyAjE0KABqDAgCEggvbS8wZHF5d2oMCAMSCC9tLzA3ZGZrcg0IAhIJL20vMGNoZ3ptcgcIARIDU1lEQAFIAXABggELCP___________wGYAQE';

const selectedHotelsUrl =
	'https://www.google.com/travel/search?ts=CAESBgoCCAMQARpXCjkSNTIlMHg2MDE4NWVkMTgxY2RkYjc5OjB4OGE2YzRkMDYzZGU4Y2FhZjoMU2hpbnlva29oYW1hGgASGhIUCgcI6g8QChgdEgcI6g8QCxgBGAMyAggBKhAKBToDQVVEGgAiBRIDEJYB';

const selectedKyotoHotelsUrl =
	'https://www.google.com/travel/search?qs=CAEgACgAMihDaG9JNTRPdl9QcUQ3YmVIQVJvTkwyY3ZNVEZ5Ylhaak9EUTNjaEFCOA1IAA&ts=CAESBgoCCAMQARpYCjoSNjIlMHg2MDAxMDhhZTkxOGIwMmVmOjB4YjYxYTQ0NmU3NGEyMWMwODoNS3lvdG8gU3RhdGlvbhoAEhoSFAoHCOoPEAsYAhIHCOoPEAsYBBgCMgIIASoRCgU6A0FVRBoAIgYSAhB6GAE&utm_campaign=sharing&utm_medium=link_btn&utm_source=htls';

const hotelShareUrl = 'https://www.google.com/travel/hotels/s/jqZoDPSDyUE5pcq16';
const resolvedHotelShareUrl =
	'https://www.google.com.au/travel/hotels/entity/CgsI54Ov_PqD7beHARAB?ts=CAEaIAoCGgASGhIUCgcI6g8QCxgCEgcI6g8QCxgEGAIyAggCKgkKBToDQVVEGgA';
const selectedKagoshimaHotelUrl =
	'https://www.google.com/travel/hotels/entity/ChoIxcGlvN3r497pARoNL2cvMTF2ajMxcW56NBAB?q=accommodation%20kagoshima&ts=CAESBgoCCAMQARo3ChkSFQoIL20vMDQ5d206CUthZ29zaGltYRoAEhoSFAoHCOoPEAoYGxIHCOoPEAoYHBgBMgIIASoJCgU6A0FVRBoA';
const eleHotelMapsUrl =
	'https://www.google.com/maps/place/ELE+Hotel+%E6%A8%9F%E8%91%89/@34.8627692,135.6751333,1405m/data=!3m1!1e3!4m11!3m10!1s0x60011babd174ef51:0x876fb41faf8bc1e7!5m4!1s2026-11-02!2i2!4m1!1i2!8m2!3d34.8627692!4d135.6777082!16s%2Fg%2F11rmvc847r';

afterEach(() => {
	privateEnvironment.AERODATABOX_API_KEY = undefined;
	privateEnvironment.AERODATABOX_DIRECT_API_KEY = undefined;
	privateEnvironment.GOOGLE_PLACES_API_KEY = undefined;
	privateEnvironment.GOOGLE_ROUTES_API_KEY = undefined;
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

	it('imports scheduled transit vehicle legs from a Google Maps transit direction', async () => {
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'test-key';
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: 'OK', timeZoneId: 'Asia/Kuala_Lumpur' }), {
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						routes: [
							{
								legs: [
									{
										steps: [
											{
												transitDetails: {
													localizedValues: {
														arrivalTime: { timeZone: 'Asia/Kuala_Lumpur' },
														departureTime: { timeZone: 'Asia/Kuala_Lumpur' }
													},
													stopDetails: {
														arrivalStop: {
															location: { latLng: { latitude: 1.4632, longitude: 103.7646 } },
															name: 'JB Sentral'
														},
														arrivalTime: '2026-10-27T06:30:00Z',
														departureStop: {
															location: { latLng: { latitude: 3.1342, longitude: 101.686 } },
															name: 'KL Sentral'
														},
														departureTime: '2026-10-27T02:00:00Z'
													},
													transitLine: {
														agencies: [{ name: 'KTM Berhad' }],
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
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			resolveGoogleItineraryUrl(
				'https://www.google.com/maps/dir/KL+Sentral/JB+Sentral/data=!1d101.6860377!2d3.1341631!1d103.7621742!2d1.4633316!6e0!7e2!8j1793095200!3e3'
			)
		).resolves.toEqual([
			expect.objectContaining({
				title: 'KL Sentral > JB Sentral',
				transport: {
					mode: 'rail',
					operator: 'KTM Berhad',
					serviceNumber: 'ETS 9321',
					schedule: {
						arrival: { scheduledAt: Date.UTC(2026, 9, 27, 6, 30), timeZone: 'Asia/Kuala_Lumpur' },
						departure: { scheduledAt: Date.UTC(2026, 9, 27, 2), timeZone: 'Asia/Kuala_Lumpur' }
					}
				},
				locations: [
					expect.objectContaining({ name: 'KL Sentral', role: 'departure' }),
					expect.objectContaining({ name: 'JB Sentral', role: 'arrival' })
				]
			})
		]);

		const [, routeRequest] = fetchMock.mock.calls[1] ?? [];
		expect(routeRequest).toMatchObject({
			body: JSON.stringify({
				destination: { address: 'JB Sentral' },
				departureTime: '2026-10-27T02:00:00.000Z',
				origin: { address: 'KL Sentral' },
				travelMode: 'TRANSIT'
			})
		});
	});

	it('keeps the ordinary directions fallback when Google Routes is not configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			resolveGoogleItineraryUrl(
				'https://www.google.com/maps/dir/KL+Sentral/JB+Sentral/data=!1d101.6860377!2d3.1341631!1d103.7621742!2d1.4633316!6e0!7e2!8j1793095200!3e3'
			)
		).resolves.toEqual([
			expect.objectContaining({
				title: 'KL Sentral > JB Sentral',
				transport: { mode: 'other' }
			})
		]);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uses the arrival endpoint and arrival timestamp for a local arrive-by transit selection', async () => {
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'test-key';
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: 'OK', timeZoneId: 'Asia/Kuala_Lumpur' }), {
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ routes: [] }), { headers: { 'content-type': 'application/json' } })
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			resolveGoogleItineraryUrl(
				'https://www.google.com/maps/dir/KL+Sentral/JB+Sentral/data=!1d101.6860377!2d3.1341631!1d103.7621742!2d1.4633316!6e1!7e2!8j1793095200!3e3'
			)
		).resolves.toMatchObject([expect.objectContaining({ transport: { mode: 'other' } })]);

		const [timeZoneRequest] = fetchMock.mock.calls[0] ?? [];
		expect((timeZoneRequest as URL).searchParams.get('location')).toBe('1.4633316,103.7621742');
		const [, routeRequest] = fetchMock.mock.calls[1] ?? [];
		expect(JSON.parse((routeRequest as RequestInit).body as string)).toEqual({
			destination: { address: 'JB Sentral' },
			arrivalTime: '2026-10-27T02:00:00.000Z',
			origin: { address: 'KL Sentral' },
			travelMode: 'TRANSIT'
		});
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

	it('imports an explicitly named hotel Maps link as an accommodation review candidate', async () => {
		await expect(resolveGoogleItineraryUrl(eleHotelMapsUrl)).resolves.toEqual([
			expect.objectContaining({
				type: 'accommodation',
				title: 'ELE Hotel 樟葉',
				propertyStatus: 'confirmed',
				locations: [
					expect.objectContaining({
						coordinates: { latitude: 34.8627692, longitude: 135.6777082 },
						name: 'ELE Hotel 樟葉'
					})
				]
			})
		]);
	});

	it('confirms a Google Maps hotel with Places data and uses its property time zone', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						places: [
							{
								displayName: { text: 'ELE Hotel 樟葉' },
								formattedAddress: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan',
								location: { latitude: 34.8627692, longitude: 135.6777082 },
								primaryType: 'lodging',
								timeZone: 'Asia/Tokyo'
							}
						]
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
		);

		await expect(resolveGoogleItineraryUrl(eleHotelMapsUrl)).resolves.toEqual([
			expect.objectContaining({
				type: 'accommodation',
				propertyStatus: 'confirmed',
				suggestedTimeZone: 'Asia/Tokyo',
				locations: [expect.objectContaining({ address: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan' })]
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

	it('imports a Google Hotels search as an accommodation stay with its destination and dates', async () => {
		await expect(resolveGoogleItineraryUrl(selectedHotelsUrl)).resolves.toEqual([
			expect.objectContaining({
				type: 'accommodation',
				title: 'Accommodation in Shinyokohama',
				suggestedStartDate: '2026-10-29',
				suggestedEndDate: '2026-11-01',
				locations: [
					expect.objectContaining({
						name: 'Shinyokohama',
						role: 'primary',
						googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shinyokohama'
					})
				],
				links: [{ label: 'Google Hotels', url: selectedHotelsUrl }]
			})
		]);
	});

	it('imports a Google Hotels destination whose encoded name is not twelve bytes long', async () => {
		expect(parseGoogleHotelsSearch(new URL(selectedKyotoHotelsUrl))).toMatchObject({
			selectedHotelEntityToken: 'ChoI54Ov_PqD7beHARoNL2cvMTFybXZjODQ3chAB'
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					[
						'<h1 class="hotel-name">ELE Hotel 樟葉</h1>',
						'<span aria-label="hotel address is 1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan">',
						'https://maps.google.com/maps?ll\\u003d34.8627692,135.6777082'
					].join(''),
					{ headers: { 'content-type': 'text/html' } }
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(resolveGoogleItineraryUrl(selectedKyotoHotelsUrl)).resolves.toMatchObject([
			{
				type: 'accommodation',
				title: 'ELE Hotel 樟葉',
				suggestedStartDate: '2026-11-02',
				suggestedEndDate: '2026-11-04',
				locations: [
					expect.objectContaining({
						address: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan',
						coordinates: { latitude: 34.8627692, longitude: 135.6777082 },
						name: 'ELE Hotel 樟葉',
						role: 'primary'
					})
				]
			}
		]);

		const [requestUrl, request] = fetchMock.mock.calls[0] ?? [];
		expect((requestUrl as URL).toString()).toBe(
			'https://www.google.com/travel/hotels/entity/ChoI54Ov_PqD7beHARoNL2cvMTFybXZjODQ3chAB?hl=en'
		);
		expect(request).toMatchObject({ headers: { 'accept-language': 'en' }, redirect: 'manual' });
	});

	it('imports a Google Hotels share link with property, address, stay dates, and published stay times', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { headers: { location: resolvedHotelShareUrl }, status: 302 }))
			.mockResolvedValueOnce(
				new Response(
					[
						'<h1 class="hotel-name">ELE Hotel 樟葉</h1>',
						'<span class="address">1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan</span>',
						'ELE Hotel 樟葉 has a check-in time of 3:00 pm and a check-out time of 10:00 am'
					].join('')
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(resolveGoogleItineraryUrl(hotelShareUrl)).resolves.toEqual([
			expect.objectContaining({
				type: 'accommodation',
				title: 'ELE Hotel 樟葉',
				suggestedStartDate: '2026-11-02',
				suggestedEndDate: '2026-11-04',
				suggestedCheckInTime: '15:00',
				suggestedCheckOutTime: '10:00',
				locations: [
					expect.objectContaining({
						address: '1 Chome-5-5 Machikuzuha, Hirakata, Osaka 573-1106, Japan',
						googleMapsUrl:
							'https://www.google.com/maps/search/?api=1&query=1+Chome-5-5+Machikuzuha%2C+Hirakata%2C+Osaka+573-1106%2C+Japan',
						name: 'ELE Hotel 樟葉'
					})
				],
				links: [{ label: 'Google Hotels', url: hotelShareUrl }]
			})
		]);

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			new URL(hotelShareUrl),
			expect.objectContaining({ headers: { 'accept-language': 'en' }, redirect: 'manual' })
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			new URL(resolvedHotelShareUrl),
			expect.objectContaining({ headers: { 'accept-language': 'en' }, redirect: 'manual' })
		);
	});

	it('prefills a Google Hotels property from its Knowledge Graph entity when its page is unavailable', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('<html><body>Google Travel</body></html>'))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						itemListElement: [
							{
								result: {
									'@id': '/g/11vj31qnz4',
									'@type': ['Hotel'],
									name: 'Example Kagoshima Hotel'
								}
							}
						]
					}),
					{ headers: { 'content-type': 'application/json' } }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						places: [
							{
								displayName: { text: 'Example Kagoshima Hotel' },
								formattedAddress: '1-2-3 Tenmonkan, Kagoshima, Japan',
								googleMapsUri:
									'https://www.google.com/maps/place/Example+Kagoshima+Hotel/data=!4m2!3m1!1s0x0:0x0!16s%2Fg%2F11vj31qnz4',
								location: { latitude: 31.59, longitude: 130.55 },
								primaryType: 'lodging',
								timeZone: 'Asia/Tokyo'
							}
						]
					}),
					{ headers: { 'content-type': 'application/json' } }
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(resolveGoogleItineraryUrl(selectedKagoshimaHotelUrl)).resolves.toEqual([
			expect.objectContaining({
				type: 'accommodation',
				title: 'Example Kagoshima Hotel',
				propertyStatus: 'confirmed',
				suggestedStartDate: '2026-10-27',
				suggestedEndDate: '2026-10-28',
				suggestedTimeZone: 'Asia/Tokyo',
				locations: [
					expect.objectContaining({
						address: '1-2-3 Tenmonkan, Kagoshima, Japan',
						coordinates: { latitude: 31.59, longitude: 130.55 },
						googleMapsUrl:
							'https://www.google.com/maps/place/Example+Kagoshima+Hotel/data=!4m2!3m1!1s0x0:0x0!16s%2Fg%2F11vj31qnz4',
						name: 'Example Kagoshima Hotel',
						role: 'primary'
					})
				]
			})
		]);

		const [, knowledgeGraphRequest] = fetchMock.mock.calls[1] ?? [];
		expect(knowledgeGraphRequest).toMatchObject({ signal: expect.any(AbortSignal) });
		expect(JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string)).toEqual({
			includedType: 'lodging',
			pageSize: 5,
			strictTypeFiltering: true,
			textQuery: 'Example Kagoshima Hotel, accommodation kagoshima'
		});
	});

	it('enriches a Google Hotels destination with Google Places coordinates when configured', async () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					places: [
						{
							displayName: { text: 'Shin-Yokohama' },
							googleMapsUri: 'https://www.google.com/maps/place/Shin-Yokohama',
							location: { latitude: 35.5074, longitude: 139.6176 },
							primaryType: 'neighborhood'
						}
					]
				}),
				{ headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(resolveGoogleItineraryUrl(selectedHotelsUrl)).resolves.toMatchObject([
			{
				locations: [
					{
						name: 'Shinyokohama',
						googleMapsUrl: 'https://www.google.com/maps/place/Shin-Yokohama',
						coordinates: { latitude: 35.5074, longitude: 139.6176 }
					}
				]
			}
		]);

		const [, request] = fetchMock.mock.calls[0] ?? [];
		expect(JSON.parse((request as RequestInit).body as string)).toEqual({ pageSize: 1, textQuery: 'Shinyokohama' });
	});

	it('rejects a Google Hotels link without a complete accommodation search', async () => {
		await expect(
			resolveGoogleItineraryUrl('https://www.google.com/travel/search?q=Shinyokohama')
		).rejects.toMatchObject({
			status: 422
		});
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
						code: 'PER',
						coordinates: { latitude: -31.9403, longitude: 115.9672 },
						googleMapsUrl: 'https://www.google.com/maps/place/Perth+Airport',
						name: 'Perth Airport',
						role: 'departure'
					}),
					expect.objectContaining({
						code: 'KUL',
						coordinates: { latitude: 2.7456, longitude: 101.7072 },
						googleMapsUrl: 'https://www.google.com/maps/place/Kuala+Lumpur+International+Airport',
						name: 'Kuala Lumpur International Airport',
						role: 'arrival'
					})
				]
			})
		]);
	});

	it('includes ambiguous airport candidates for the transport review flow', async () => {
		const tfs = Buffer.from(['OKA', '2026-10-27', 'KOJ', '6J', '86'].join('\0')).toString('base64url');
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
									displayName: { text: 'Naha Airport' },
									formattedAddress: 'Naha, Okinawa, Japan',
									location: { latitude: 26.1958, longitude: 127.6459 },
									primaryType: 'airport'
								},
								{
									displayName: { text: 'Okinawa Airport' },
									formattedAddress: 'Okinawa, Japan',
									location: { latitude: 26.3342, longitude: 127.8056 },
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
									displayName: { text: 'Kagoshima Airport' },
									formattedAddress: 'Kirishima, Kagoshima, Japan',
									location: { latitude: 31.8034, longitude: 130.7194 },
									primaryType: 'airport'
								},
								{
									displayName: { text: 'Kagoshima New Airport' },
									formattedAddress: 'Kagoshima, Japan',
									location: { latitude: 31.807, longitude: 130.727 },
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
				title: 'OKA > KOJ',
				locations: [
					expect.objectContaining({
						airportCandidates: [
							{
								address: 'Naha, Okinawa, Japan',
								coordinates: { latitude: 26.1958, longitude: 127.6459 },
								name: 'Naha Airport'
							},
							{
								address: 'Okinawa, Japan',
								coordinates: { latitude: 26.3342, longitude: 127.8056 },
								name: 'Okinawa Airport'
							}
						],
						code: 'OKA',
						name: 'OKA',
						role: 'departure'
					}),
					expect.objectContaining({
						airportCandidates: [
							{
								address: 'Kirishima, Kagoshima, Japan',
								coordinates: { latitude: 31.8034, longitude: 130.7194 },
								name: 'Kagoshima Airport'
							},
							{
								address: 'Kagoshima, Japan',
								coordinates: { latitude: 31.807, longitude: 130.727 },
								name: 'Kagoshima New Airport'
							}
						],
						code: 'KOJ',
						name: 'KOJ',
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
						code: 'KIX',
						googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kansai+International+Airport',
						name: 'Kansai International Airport',
						role: 'departure'
					}),
					expect.objectContaining({
						code: 'SYD',
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
