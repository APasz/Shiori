import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	defaultThemeMode,
	nextThemeMode,
	resolveTheme,
	subscribeToThemeMode,
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

function stubThemeDocument(dataset: Record<string, string>): void {
	vi.stubGlobal('document', {
		addEventListener: vi.fn(),
		documentElement: { dataset },
		removeEventListener: vi.fn()
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('theme preference', () => {
	it('defaults to automatic mode when no valid preference has been stored', () => {
		expect(defaultThemeMode).toBe('system');
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
		expect(initializedThemeDataset(null, true)).toEqual({ theme: 'light', themeMode: 'system' });
		expect(initializedThemeDataset(null, false)).toEqual({ theme: 'dark', themeMode: 'system' });
	});

	it('retains the automatic default when browser storage is unavailable', () => {
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
		expect(dataset).toEqual({ theme: 'light', themeMode: 'system' });
	});

	it('falls automatic mode back to dark when the system preference is unavailable', () => {
		const dataset: Record<string, string> = {};
		runInNewContext(themeInitializationScriptContent, {
			document: { documentElement: { dataset } },
			localStorage: { getItem: () => null },
			window: {}
		});
		expect(dataset).toEqual({ theme: 'dark', themeMode: 'system' });
	});

	it('notifies automatic-mode subscribers when the system theme changes', () => {
		const systemThemeListeners = new Set<() => void>();
		const systemThemeQuery = {
			addEventListener: (_type: string, listener: () => void) => systemThemeListeners.add(listener),
			matches: false,
			removeEventListener: (_type: string, listener: () => void) => systemThemeListeners.delete(listener)
		};
		const dataset = { theme: 'dark', themeMode: 'system' };
		stubThemeDocument(dataset);
		vi.stubGlobal('window', { matchMedia: () => systemThemeQuery });
		const listener = vi.fn();
		const unsubscribe = subscribeToThemeMode(listener);

		expect(listener).toHaveBeenLastCalledWith('system', 'dark');
		systemThemeQuery.matches = true;
		for (const systemThemeListener of systemThemeListeners) {
			systemThemeListener();
		}

		expect(dataset.theme).toBe('light');
		expect(listener).toHaveBeenLastCalledWith('system', 'light');
		unsubscribe();
	});

	it('falls automatic-mode subscribers back to dark without matchMedia support', () => {
		const dataset = { theme: 'light', themeMode: 'system' };
		stubThemeDocument(dataset);
		vi.stubGlobal('window', {});
		const listener = vi.fn();
		const unsubscribe = subscribeToThemeMode(listener);

		expect(dataset.theme).toBe('dark');
		expect(listener).toHaveBeenLastCalledWith('system', 'dark');
		unsubscribe();
	});
});
