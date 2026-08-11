import { describe, expect, it } from 'vitest';
import { isOpenRailwayMapUrl } from '../itinerary/schema';
import { OpenRailwayMapResolveError, parseOpenRailwayMapLocationUrl } from './openrailwaymap';

describe('OpenRailwayMap location parsing', () => {
	it('reads station names and map coordinates from an OpenRailwayMap permalink', () => {
		expect(
			parseOpenRailwayMapLocationUrl(
				new URL(
					'https://www.openrailwaymap.org/index.php?style=standard&name=Flinders+Street+Station&lat=-37.8183&lon=144.9671&zoom=14'
				)
			)
		).toEqual({
			coordinates: { latitude: -37.8183, longitude: 144.9671 },
			name: 'Flinders Street Station',
			openRailwayMapUrl:
				'https://www.openrailwaymap.org/index.php?style=standard&name=Flinders+Street+Station&lat=-37.8183&lon=144.9671&zoom=14'
		});
	});

	it('accepts coordinate-only permalinks while requiring a complete valid map position', () => {
		expect(
			parseOpenRailwayMapLocationUrl(new URL('https://openrailwaymap.org/?lat=51.58248&lon=15.6501&zoom=3'))
		).toEqual({
			coordinates: { latitude: 51.58248, longitude: 15.6501 },
			openRailwayMapUrl: 'https://openrailwaymap.org/?lat=51.58248&lon=15.6501&zoom=3'
		});

		expect(() => parseOpenRailwayMapLocationUrl(new URL('https://openrailwaymap.org/?lat=51.5'))).toThrow(
			OpenRailwayMapResolveError
		);
		expect(() => parseOpenRailwayMapLocationUrl(new URL('https://openrailwaymap.org/?lat=95&lon=15'))).toThrow(
			OpenRailwayMapResolveError
		);
	});

	it('accepts only OpenRailwayMap map URLs and rejects links with no usable location state', () => {
		expect(isOpenRailwayMapUrl('https://www.openrailwaymap.org/mobile.php?name=Tokyo')).toBe(true);
		expect(isOpenRailwayMapUrl('https://openrailwaymap.app/?lat=35&lon=139')).toBe(false);
		expect(isOpenRailwayMapUrl('https://example.com/?lat=35&lon=139')).toBe(false);
		expect(() => parseOpenRailwayMapLocationUrl(new URL('https://www.openrailwaymap.org/?style=standard'))).toThrow(
			OpenRailwayMapResolveError
		);
	});
});
