import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewerContext, viewerTimeZoneStorageKey } from './viewer-context.svelte';

afterEach(() => {
	vi.unstubAllGlobals();
});

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

	it('preserves the simulated presentation zone during browser redetection', () => {
		let browserTimeZone = 'Australia/Melbourne';
		const viewerContext = new ViewerContext(() => browserTimeZone);

		viewerContext.redetectBrowserTimeZone();
		viewerContext.setSimulated(Date.UTC(2026, 0, 1));
		browserTimeZone = 'Asia/Tokyo';

		viewerContext.redetectBrowserTimeZone();

		expect(viewerContext.timeZone).toBe('Australia/Melbourne');
		expect(viewerContext.revision).toBe(2);
	});

	it('uses an explicit time-zone override until it returns to the browser zone', () => {
		let browserTimeZone = 'Asia/Tokyo';
		const viewerContext = new ViewerContext(() => browserTimeZone);

		viewerContext.redetectBrowserTimeZone();
		viewerContext.setTimeZoneOverride('America/New_York');
		browserTimeZone = 'Europe/London';
		viewerContext.redetectBrowserTimeZone();

		expect(viewerContext.browserTimeZone).toBe('Europe/London');
		expect(viewerContext.isTimeZoneOverridden).toBe(true);
		expect(viewerContext.timeZone).toBe('America/New_York');

		viewerContext.clearTimeZoneOverride();

		expect(viewerContext.isTimeZoneOverridden).toBe(false);
		expect(viewerContext.timeZone).toBe('Europe/London');
		expect(viewerContext.revision).toBe(3);
	});

	it('immediately applies the browser zone when the user selects it', () => {
		const viewerContext = new ViewerContext(() => 'Asia/Tokyo');

		viewerContext.redetectBrowserTimeZone();
		viewerContext.setTimeZoneOverride('America/New_York');
		viewerContext.setTimeZoneOverride('Asia/Tokyo');

		expect(viewerContext.isTimeZoneOverridden).toBe(false);
		expect(viewerContext.timeZone).toBe('Asia/Tokyo');
		expect(viewerContext.revision).toBe(3);
	});

	it('rejects an invalid time-zone override', () => {
		const viewerContext = new ViewerContext(() => 'UTC');

		expect(() => viewerContext.setTimeZoneOverride('Mars/Olympus_Mons')).toThrow('is not valid');
	});

	it('persists an explicit time-zone override until it is cleared', () => {
		const localStorage = {
			getItem: vi.fn(),
			removeItem: vi.fn(),
			setItem: vi.fn()
		};
		vi.stubGlobal('localStorage', localStorage);
		const viewerContext = new ViewerContext(() => 'Asia/Tokyo');

		viewerContext.redetectBrowserTimeZone();
		viewerContext.setTimeZoneOverride('America/New_York');

		expect(localStorage.setItem).toHaveBeenCalledWith(viewerTimeZoneStorageKey, 'America/New_York');

		viewerContext.clearTimeZoneOverride();

		expect(localStorage.removeItem).toHaveBeenCalledWith(viewerTimeZoneStorageKey);
	});

	it('rejects simulated times before the Unix epoch', () => {
		const viewerContext = new ViewerContext(() => 'UTC');

		expect(() => viewerContext.setSimulated(-1)).toThrow('no earlier than the Unix epoch');
	});
});
