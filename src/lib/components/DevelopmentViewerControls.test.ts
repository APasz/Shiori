import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DevelopmentViewerControls from './DevelopmentViewerControls.svelte';

describe('development viewer controls', () => {
	it('uses the top-bar zone instead of rendering a second time-zone picker', () => {
		const html = render(DevelopmentViewerControls).body;

		expect(html).toContain('top-bar time zone');
		expect(html).not.toContain('development-viewer-time-time-zone');
	});
});
