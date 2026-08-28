export const themeNames = ['dark', 'light'] as const;
export type ThemeName = (typeof themeNames)[number];
export const themeModes = ['dark', 'system', 'light'] as const;
export type ThemeMode = (typeof themeModes)[number];

export const defaultThemeMode = 'system' as const satisfies ThemeMode;
export const themeStorageKey = 'shiori:theme';
export const themeModeChangeEvent = 'shiori:theme-mode-change';
const systemThemeMediaQuery = '(prefers-color-scheme: light)';
const serializedThemeModes = JSON.stringify(themeModes);

function isThemeMode(value: unknown): value is ThemeMode {
	return themeModes.some((mode) => mode === value);
}

function systemThemeQuery(): MediaQueryList | null {
	return typeof window.matchMedia === 'function' ? window.matchMedia(systemThemeMediaQuery) : null;
}

function systemPrefersLight(query: MediaQueryList | null = systemThemeQuery()): boolean {
	return query?.matches ?? false;
}

export function themeFromStorageValue(value: unknown): ThemeMode {
	return isThemeMode(value) ? value : defaultThemeMode;
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
	return themeModes[(themeModes.indexOf(mode) + 1) % themeModes.length] ?? defaultThemeMode;
}

function setDocumentTheme(theme: ThemeName): void {
	document.documentElement.dataset.theme = theme;
}

export function resolveTheme(mode: ThemeMode, prefersLight: boolean): ThemeName {
	return mode === 'system' ? (prefersLight ? 'light' : 'dark') : mode;
}

export function currentThemeMode(): ThemeMode {
	return themeFromStorageValue(document.documentElement.dataset.themeMode);
}

export function setDocumentThemeMode(mode: ThemeMode): void {
	const theme = resolveTheme(mode, systemPrefersLight());
	document.documentElement.dataset.themeMode = mode;
	setDocumentTheme(theme);
	try {
		localStorage.setItem(themeStorageKey, mode);
	} catch {
		// The selected theme remains active when browser storage is unavailable.
	}
	document.dispatchEvent(new Event(themeModeChangeEvent));
}

function synchronizeSystemTheme(query: MediaQueryList | null = systemThemeQuery()): boolean {
	if (currentThemeMode() !== 'system') {
		return false;
	}

	setDocumentTheme(resolveTheme('system', systemPrefersLight(query)));
	return true;
}

export function subscribeToThemeMode(listener: (mode: ThemeMode, theme: ThemeName) => void): () => void {
	const query = systemThemeQuery();
	const synchronizeThemeMode = () => {
		const mode = currentThemeMode();
		listener(mode, resolveTheme(mode, systemPrefersLight(query)));
	};
	const synchronizeSystemThemeOnChange = () => {
		if (synchronizeSystemTheme(query)) {
			synchronizeThemeMode();
		}
	};

	synchronizeSystemTheme(query);
	synchronizeThemeMode();
	document.addEventListener(themeModeChangeEvent, synchronizeThemeMode);
	query?.addEventListener('change', synchronizeSystemThemeOnChange);
	return () => {
		document.removeEventListener(themeModeChangeEvent, synchronizeThemeMode);
		query?.removeEventListener('change', synchronizeSystemThemeOnChange);
	};
}

export const themeInitializationScriptContent = `(function(){var mode='${defaultThemeMode}';try{var stored=localStorage.getItem('${themeStorageKey}');if(${serializedThemeModes}.includes(stored)){mode=stored;}}catch{}var theme=mode==='system'&&window.matchMedia&&window.matchMedia('${systemThemeMediaQuery}').matches?'light':mode==='system'?'dark':mode;document.documentElement.dataset.themeMode=mode;document.documentElement.dataset.theme=theme;})();`;
export const themeInitializationScript = `<script>${themeInitializationScriptContent}</script>`;
