import { describe, expect, it } from 'vitest';
import {
	browserTimeZoneOptions,
	searchTimeZoneOptions,
	timeZoneOffsetLabel,
	timeZoneShortLabel
} from './time-zone-search';

describe('time-zone search', () => {
	it('builds the browser time-zone index once', () => {
		expect(browserTimeZoneOptions()).toBe(browserTimeZoneOptions());
	});

	it('finds a time-zone code and its associated places', () => {
		const matches = searchTimeZoneOptions(browserTimeZoneOptions(), 'CST', 64);

		expect(matches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					aliases: expect.arrayContaining(['CST']),
					places: expect.arrayContaining(['Chicago']),
					timeZone: 'America/Chicago'
				}),
				expect.objectContaining({
					aliases: expect.arrayContaining(['CST']),
					places: expect.arrayContaining(['Shanghai']),
					timeZone: 'Asia/Shanghai'
				})
			])
		);
	});

	it('finds the canonical zone when searching for a place or IANA identifier', () => {
		const options = browserTimeZoneOptions();

		expect(searchTimeZoneOptions(options, 'Tokyo')[0]).toMatchObject({
			places: expect.arrayContaining(['Tokyo']),
			timeZone: 'Asia/Tokyo'
		});
		expect(searchTimeZoneOptions(options, 'Australia/Melbourne')[0]).toMatchObject({
			timeZone: 'Australia/Melbourne'
		});
	});

	it('uses timezone-database abbreviations for timeline time-zone labels', () => {
		expect(timeZoneShortLabel('Asia/Hong_Kong', 1_775_952_000_000)).toBe('HKT');
	});

	it('uses a timestamp-specific abbreviation when the browser provides one', () => {
		expect(timeZoneShortLabel('Australia/Melbourne', Date.UTC(2026, 0, 15, 12))).toBe('AEDT');
		expect(timeZoneShortLabel('America/Chicago', Date.UTC(2026, 6, 15, 12))).toBe('CDT');
	});

	it('uses an event-specific UTC offset in compact time tooltips', () => {
		expect(timeZoneOffsetLabel('Asia/Hong_Kong', 1_775_952_000_000)).toBe('UTC+08:00');
		expect(timeZoneOffsetLabel('America/Chicago', 1_775_952_000_000)).toBe('UTC-05:00');
	});
});
