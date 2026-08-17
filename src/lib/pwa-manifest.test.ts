import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type WebAppManifest = Readonly<{
	background_color: string;
	display: string;
	id: string;
	icons: readonly Readonly<{ purpose: string; sizes: string; src: string; type: string }>[];
	name: string;
	short_name: string;
	start_url: string;
}>;

async function readWebAppManifest(): Promise<WebAppManifest> {
	const manifestUrl = new URL('../../static/manifest.webmanifest', import.meta.url);
	return JSON.parse(await readFile(manifestUrl, 'utf8')) as WebAppManifest;
}

describe('web app manifest', () => {
	it('defines a standalone Android install with required launcher icon sizes', async () => {
		const manifest = await readWebAppManifest();

		expect(manifest).toMatchObject({
			background_color: '#000000',
			display: 'standalone',
			id: '/',
			name: 'Shiori',
			short_name: 'Shiori',
			start_url: '/'
		});
		expect(manifest.icons).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					purpose: 'any maskable',
					sizes: '192x192',
					src: '/icons/shiori-192.png',
					type: 'image/png'
				}),
				expect.objectContaining({
					purpose: 'any maskable',
					sizes: '512x512',
					src: '/icons/shiori-512.png',
					type: 'image/png'
				})
			])
		);
	});
});
