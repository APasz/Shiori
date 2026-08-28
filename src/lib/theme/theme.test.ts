import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
	defaultThemeMode,
	nextThemeMode,
	resolveTheme,
	themeFromStorageValue,
	themeInitializationScriptContent
} from './theme';

function initializedThemeDataset(storedMode: string | null, prefersLight: boolean): Record<string, string> {
	const dataset: Record<string, string> = {};
	runInNewContext(themeInitializationScriptContent, {
		document: { documentElement: { dataset } },
		localStorage: { getItem: () => storedMode },
		window: { matchMedia: () => ({ matches: prefersLight }) }
	});
	return dataset;
}

describe('theme preference', () => {
	it('defaults to dark mode when no valid preference has been stored', () => {
		expect(themeFromStorageValue(null)).toBe(defaultThemeMode);
		expect(themeFromStorageValue('invalid')).toBe(defaultThemeMode);
	});

	it('accepts persisted device modes and cycles through each option', () => {
		expect(themeFromStorageValue('light')).toBe('light');
		expect(themeFromStorageValue('system')).toBe('system');
		expect(nextThemeMode('dark')).toBe('system');
		expect(nextThemeMode('system')).toBe('light');
		expect(nextThemeMode('light')).toBe('dark');
	});

	it('resolves automatic mode from the system preference', () => {
		expect(resolveTheme('system', false)).toBe('dark');
		expect(resolveTheme('system', true)).toBe('light');
		expect(resolveTheme('dark', true)).toBe('dark');
	});

	it('sets the resolved system theme before the page renders', () => {
		expect(initializedThemeDataset('system', true)).toEqual({ theme: 'light', themeMode: 'system' });
		expect(initializedThemeDataset(null, true)).toEqual({ theme: 'dark', themeMode: 'dark' });
	});

	it('retains the dark default when browser storage is unavailable', () => {
		const dataset: Record<string, string> = {};
		runInNewContext(themeInitializationScriptContent, {
			document: { documentElement: { dataset } },
			localStorage: {
				getItem: () => {
					throw new Error('Storage is unavailable.');
				}
			},
			window: { matchMedia: () => ({ matches: true }) }
		});
		expect(dataset).toEqual({ theme: 'dark', themeMode: 'dark' });
	});
});
