import { describe, expect, it } from 'vitest';
import { browserTimeZoneOptions, searchTimeZoneOptions } from './time-zone-search';

describe('time-zone search', () => {
	it('builds the browser time-zone index once', () => {
		expect(browserTimeZoneOptions()).toBe(browserTimeZoneOptions());
	});

	it('finds a time-zone code and its associated places', () => {
		const matches = searchTimeZoneOptions(browserTimeZoneOptions(), 'CST');

		expect(matches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					aliases: expect.arrayContaining(['CST']),
					places: expect.arrayContaining(['Chicago, United States']),
					timeZone: 'America/Chicago'
				}),
				expect.objectContaining({
					aliases: expect.arrayContaining(['CST']),
					places: expect.arrayContaining(['Shanghai, China']),
					timeZone: 'Asia/Shanghai'
				})
			])
		);
	});

	it('finds the canonical zone when searching for a place or IANA identifier', () => {
		const options = browserTimeZoneOptions();

		expect(searchTimeZoneOptions(options, 'Tokyo')[0]).toMatchObject({
			places: ['Tokyo, Japan'],
			timeZone: 'Asia/Tokyo'
		});
		expect(searchTimeZoneOptions(options, 'Australia/Melbourne')[0]).toMatchObject({
			timeZone: 'Australia/Melbourne'
		});
	});
});
