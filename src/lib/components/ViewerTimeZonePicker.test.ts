import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ViewerTimeZonePicker from './ViewerTimeZonePicker.svelte';

describe('viewer time-zone picker', () => {
	it('renders the current viewer zone and a searchable selection control', () => {
		const html = render(ViewerTimeZonePicker).body;

		expect(html).toContain('aria-label="View times in UTC"');
		expect(html).toContain('aria-label="Choose display time zone"');
		expect(html).toContain('value="UTC"');
	});
});
