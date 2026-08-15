import { describe, expect, it } from 'vitest';
import { artworkAssets, artworkNames, iconAssets, iconNames } from './registry';
import { visualAsset } from './types';

describe('visual registry', () => {
	it('registers every public icon name', () => {
		expect(Object.keys(iconAssets).sort()).toEqual([...iconNames].sort());
	});

	it('registers every public artwork name', () => {
		expect(Object.keys(artworkAssets).sort()).toEqual([...artworkNames].sort());
	});

	it('allows assets from different providers in the same registry', () => {
		const assets = [
			visualAsset('tabler', iconAssets.back.renderer),
			visualAsset('local-artwork', artworkAssets.activity.renderer)
		];

		expect(assets.map((asset) => asset.provider)).toEqual(['tabler', 'local-artwork']);
	});
});
