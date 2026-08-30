import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ItineraryExporter from './ItineraryExporter.svelte';

describe('itinerary exporter', () => {
	it('renders copy feedback in a persistent live region', () => {
		const html = render(ItineraryExporter, {
			props: {
				itinerary: {
					items: [],
					timeZone: 'Australia/Melbourne',
					title: 'Weekend away'
				},
				onDismiss: () => {}
			}
		}).body;

		expect(html).toContain('Copy Clipboard');
		expect(html).toContain('aria-atomic="true" aria-live="polite"');
		expect(html).toMatch(/class="[^"]*copy-button-label/);
	});
});
