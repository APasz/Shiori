export const themeNames = ['dark', 'light'] as const;
export type ThemeName = (typeof themeNames)[number];

export const defaultTheme: ThemeName = 'dark';
export const themeStorageKey = 'shiori:theme';

export function themeFromStorageValue(value: unknown): ThemeName {
	return value === 'light' || value === 'dark' ? value : defaultTheme;
}

export function alternateTheme(theme: ThemeName): ThemeName {
	return theme === 'dark' ? 'light' : 'dark';
}

export function setDocumentTheme(theme: ThemeName): void {
	document.documentElement.dataset.theme = theme;
}

export const themeInitializationScriptContent = `(function(){try{var theme=localStorage.getItem('${themeStorageKey}');if(theme==='dark'||theme==='light'){document.documentElement.dataset.theme=theme;}}catch{}})();`;
export const themeInitializationScript = `<script>${themeInitializationScriptContent}</script>`;
