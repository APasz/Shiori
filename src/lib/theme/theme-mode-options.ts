import type { IconName } from '$lib/visuals/registry';
import { themeModes, type ThemeMode } from './theme';

export const themeModeVisuals = {
	dark: { compactLabel: 'Dark', icon: 'darkTheme', label: 'Dark' },
	system: { compactLabel: 'Auto', icon: 'systemTheme', label: 'Automatic' },
	light: { compactLabel: 'Light', icon: 'lightTheme', label: 'Light' }
} as const satisfies Record<ThemeMode, { compactLabel: string; icon: IconName; label: string }>;

export const themeModeOptions = themeModes.map((value) => ({ value, ...themeModeVisuals[value] }));
