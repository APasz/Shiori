import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const iconAssetUrl = new URL('../assets/icon.svg', import.meta.url);

describe('Shiori icon asset', () => {
	it('uses presentation attributes so the inlined icon remains painted under the production CSP', async () => {
		const iconMarkup = await readFile(iconAssetUrl, 'utf8');

		expect(iconMarkup).not.toMatch(/<style\b/i);
		expect(iconMarkup).toContain('fill="var(--color-icon-bookmark-outline, #3a3a3c)"');
		expect(iconMarkup).toContain('fill="var(--color-icon-bookmark-background, #000000)"');
		expect(iconMarkup).toContain('stroke="var(--color-icon-route, #00e4ec)"');
	});
});
