import { describe, expect, it } from 'vitest';
import { alternateTheme, defaultTheme, themeFromStorageValue } from './theme';

describe('theme preference', () => {
	it('defaults to dark mode when no valid preference has been stored', () => {
		expect(themeFromStorageValue(null)).toBe(defaultTheme);
		expect(themeFromStorageValue('system')).toBe(defaultTheme);
	});

	it('accepts persisted themes and swaps between them', () => {
		expect(themeFromStorageValue('light')).toBe('light');
		expect(alternateTheme('dark')).toBe('light');
		expect(alternateTheme('light')).toBe('dark');
	});
});
