import { describe, expect, it } from 'vitest';
import { ViewerContext } from './viewer-context.svelte';

describe('ViewerContext browser time-zone detection', () => {
	it('updates its zone and revision only after the browser zone changes', () => {
		let browserTimeZone = 'Asia/Tokyo';
		const viewerContext = new ViewerContext(() => browserTimeZone);

		viewerContext.redetectBrowserTimeZone();

		expect(viewerContext.timeZone).toBe('Asia/Tokyo');
		expect(viewerContext.revision).toBe(1);

		viewerContext.redetectBrowserTimeZone();

		expect(viewerContext.revision).toBe(1);

		browserTimeZone = 'America/New_York';
		viewerContext.redetectBrowserTimeZone();

		expect(viewerContext.timeZone).toBe('America/New_York');
		expect(viewerContext.revision).toBe(2);
	});

	it('preserves a simulated time zone during browser redetection', () => {
		const viewerContext = new ViewerContext(() => 'Asia/Tokyo');
		viewerContext.setSimulated(Date.UTC(2026, 0, 1), 'Australia/Melbourne');

		viewerContext.redetectBrowserTimeZone();

		expect(viewerContext.timeZone).toBe('Australia/Melbourne');
		expect(viewerContext.revision).toBe(1);
	});
});
