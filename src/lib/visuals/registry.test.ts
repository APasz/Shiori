import { describe, expect, it } from 'vitest';
import { artworkAssets, artworkNames, iconAssets, iconNames } from './registry';

describe('visual registry', () => {
	it('registers every public icon name', () => {
		expect(Object.keys(iconAssets).sort()).toEqual([...iconNames].sort());
	});

	it('registers every public artwork name', () => {
		expect(Object.keys(artworkAssets).sort()).toEqual([...artworkNames].sort());
	});

	it('uses Tabler as the default visual provider', () => {
		for (const asset of [...Object.values(iconAssets), ...Object.values(artworkAssets)]) {
			expect(asset.provider).toBe('tabler');
		}
	});
});
