import { describe, expect, it } from 'vitest';
import { colourwayOptions, themeCss, themePalette } from './palette';

describe('theme palette', () => {
	it('exposes themed colours for each section of the Shiori icon', () => {
		expect(themePalette.light.icon).toEqual({
			'bookmark-outline': '#1a1a19',
			'bookmark-background': '#ffffff',
			route: '#00e4ec'
		});
		expect(themePalette.dark.icon).toEqual({
			'bookmark-outline': '#f5f5f0',
			'bookmark-background': '#000000',
			route: '#00e4ec'
		});
		expect(themeCss).toContain('--color-icon-bookmark-outline: #f5f5f0;');
	});

	it('defines each curated colourway for both theme variants', () => {
		expect(colourwayOptions.map((colourway) => colourway.name)).toEqual(['classic', 'ocean', 'violet', 'sunset']);
		expect(themePalette.colourways.violet.dark.state.selection).toBe('#b89aff');
		expect(themeCss).toContain("[data-colourway='violet']");
		expect(themeCss).toContain(":root[data-theme='light'][data-colourway='violet']");
	});
});
