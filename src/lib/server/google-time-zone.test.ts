import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	GOOGLE_API_KEY: undefined as string | undefined,
	GOOGLE_TIME_ZONE_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { lookupGoogleTimeZone } from './google-time-zone';

const klSentralCoordinates = { latitude: 3.1341631, longitude: 101.6860377 };
const sourceTimestamp = Date.UTC(2026, 9, 27, 10);

afterEach(() => {
	privateEnvironment.GOOGLE_API_KEY = undefined;
	privateEnvironment.GOOGLE_TIME_ZONE_API_KEY = undefined;
	vi.unstubAllGlobals();
});

describe('Google Time Zone lookup', () => {
	it('does not make a provider request until an API key is configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(lookupGoogleTimeZone(klSentralCoordinates, sourceTimestamp)).resolves.toBeNull();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns the configured location IANA zone and prefers a dedicated key', async () => {
		privateEnvironment.GOOGLE_API_KEY = 'shared-key';
		privateEnvironment.GOOGLE_TIME_ZONE_API_KEY = 'time-zone-key';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ status: 'OK', timeZoneId: 'Asia/Kuala_Lumpur' }), {
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(lookupGoogleTimeZone(klSentralCoordinates, sourceTimestamp)).resolves.toBe('Asia/Kuala_Lumpur');

		const [requestUrl] = fetchMock.mock.calls[0] ?? [];
		expect(requestUrl).toBeInstanceOf(URL);
		const parsedUrl = requestUrl as URL;
		expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://maps.googleapis.com/maps/api/timezone/json');
		expect(parsedUrl.searchParams.get('key')).toBe('time-zone-key');
		expect(parsedUrl.searchParams.get('location')).toBe('3.1341631,101.6860377');
		expect(parsedUrl.searchParams.get('timestamp')).toBe('1793095200');
	});
});
