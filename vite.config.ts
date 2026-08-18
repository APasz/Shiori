import { createHash } from 'node:crypto';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { themeCss } from './src/lib/theme/palette.ts';
import { themeInitializationScriptContent } from './src/lib/theme/theme.ts';

const themeInitializationScriptHash: `sha256-${string}` = `sha256-${createHash('sha256')
	.update(themeInitializationScriptContent)
	.digest('base64')}`;
const themeStyleHash: `sha256-${string}` = `sha256-${createHash('sha256').update(themeCss).digest('base64')}`;

export default defineConfig({
	plugins: [
		sveltekit({
			csp: {
				mode: 'auto',
				directives: {
					'base-uri': ['self'],
					'connect-src': ['self'],
					'default-src': ['self'],
					'font-src': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'frame-src': ['none'],
					'img-src': ['self', 'data:'],
					'manifest-src': ['self'],
					'media-src': ['none'],
					'object-src': ['none'],
					'script-src': ['self', themeInitializationScriptHash],
					'script-src-attr': ['none'],
					// Dynamic layout values use style attributes; SvelteKit protects style elements with nonces or hashes.
					'style-src': ['self', themeStyleHash],
					'style-src-attr': ['unsafe-inline'],
					'worker-src': ['self']
				}
			},
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter()
		})
	],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
