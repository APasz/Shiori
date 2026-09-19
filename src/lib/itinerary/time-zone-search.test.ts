import { describe, expect, it } from 'vitest';
import {
	browserTimeZoneOptions,
	searchTimeZoneOptions,
	timeZoneOffsetLabel,
	timeZoneSelectionLabel,
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

	it('ranks a matching IANA segment ahead of zones that merely reference the place', () => {
		const matches = searchTimeZoneOptions(
			[
				{ aliases: ['GMT'], places: ['London', 'Birmingham'], timeZone: 'Europe/Guernsey' },
				{ aliases: ['GMT'], places: ['London'], timeZone: 'Europe/London' },
				{ aliases: ['GMT'], places: ['London', 'Glasgow'], timeZone: 'Europe/Jersey' }
			],
			'London'
		);

		expect(matches.map((option) => option.timeZone)).toEqual(['Europe/London', 'Europe/Guernsey', 'Europe/Jersey']);
		expect(searchTimeZoneOptions(browserTimeZoneOptions(), 'London')[0]).toMatchObject({ timeZone: 'Europe/London' });
	});

	it('uses timezone-database abbreviations for timeline time-zone labels', () => {
		expect(timeZoneShortLabel('Asia/Hong_Kong', 1_775_952_000_000)).toBe('HKT');
	});

	it('uses a timestamp-specific abbreviation when the browser provides one', () => {
		expect(timeZoneShortLabel('Australia/Melbourne', Date.UTC(2026, 0, 15, 12))).toBe('AEDT');
		expect(timeZoneShortLabel('America/Chicago', Date.UTC(2026, 6, 15, 12))).toBe('CDT');
	});

	it('uses a bare offset when the database has no named abbreviation', () => {
		expect(timeZoneShortLabel('Asia/Amman', Date.UTC(2026, 0, 15, 12))).toBe('+03:00');
	});

	it('uses an event-specific offset in compact time tooltips', () => {
		expect(timeZoneOffsetLabel('Asia/Hong_Kong', 1_775_952_000_000)).toBe('+08:00');
		expect(timeZoneOffsetLabel('America/Chicago', 1_775_952_000_000)).toBe('-05:00');
	});

	it('uses a concise place, abbreviation, and offset for picker selections', () => {
		const timestamp = Date.UTC(2026, 0, 15, 12);
		const options = browserTimeZoneOptions();

		expect(timeZoneSelectionLabel('UTC', options, timestamp)).toBe('UTC');
		expect(timeZoneSelectionLabel('Asia/Tokyo', options, timestamp)).toBe('Tokyo · JST · +09:00');
		expect(timeZoneSelectionLabel('Australia/Melbourne', options, timestamp)).toBe('Melbourne · AEDT · +11:00');
		expect(timeZoneSelectionLabel('Asia/Amman', options, timestamp)).toBe('Amman · +03:00');
	});

	it('uses a supplied friendly place name when one is available', () => {
		expect(
			timeZoneSelectionLabel(
				'Asia/Tokyo',
				[{ aliases: ['JST'], places: ['Tokyo, Japan'], timeZone: 'Asia/Tokyo' }],
				Date.UTC(2026, 0, 15, 12)
			)
		).toBe('Tokyo, Japan · JST · +09:00');
	});
});
