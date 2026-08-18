import { createHash } from 'node:crypto';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { themeInitializationScriptContent } from './src/lib/theme/theme.ts';

const themeInitializationScriptHash: `sha256-${string}` = `sha256-${createHash('sha256')
	.update(themeInitializationScriptContent)
	.digest('base64')}`;

export default defineConfig({
	plugins: [
		sveltekit({
			csp: {
				mode: 'auto',
				directives: {
					'base-uri': ['self'],
					'default-src': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'img-src': ['self', 'data:'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'script-src': ['self', themeInitializationScriptHash],
					// Svelte transitions and the validated palette use inline styles.
					'style-src': ['self', 'unsafe-inline'],
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
