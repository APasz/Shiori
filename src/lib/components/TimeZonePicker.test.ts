import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TimeZonePicker from './TimeZonePicker.svelte';

describe('TimeZonePicker', () => {
	it('shows a concise selection label while retaining the IANA identifier', () => {
		const html = render(TimeZonePicker, {
			props: {
				id: 'time-zone',
				onSelect: () => {},
				options: [{ aliases: ['JST'], places: ['Tokyo'], timeZone: 'Asia/Tokyo' }],
				referenceTimestamp: Date.UTC(2026, 0, 15, 12),
				value: 'Asia/Tokyo'
			}
		}).body;

		expect(html).toContain('value="Tokyo · JST · +09:00"');
		expect(html).toContain('title="Asia/Tokyo"');
	});
});
