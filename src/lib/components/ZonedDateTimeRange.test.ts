import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ZonedDateTimeRange from './ZonedDateTimeRange.svelte';

describe('ZonedDateTimeRange', () => {
	it('uses one time-zone control for its start and end fields', () => {
		const html = render(ZonedDateTimeRange, {
			props: {
				endDateTime: '2026-10-29T16:00',
				endId: 'availability-end',
				onEndDateTimeChange: () => {},
				onStartDateTimeChange: () => {},
				onTimeZoneChange: () => {},
				startDateTime: '2026-10-29T10:00',
				startId: 'availability-start',
				timeZone: 'Asia/Tokyo'
			}
		}).body;

		expect(html).toContain('id="availability-start-time-zone"');
		expect(html).not.toContain('id="availability-end-time-zone"');
		expect(html).toContain('>Start</span>');
		expect(html).toContain('>End</span>');
	});

	it('supports a time-only endpoint beside a date-time endpoint', () => {
		const html = render(ZonedDateTimeRange, {
			props: {
				endDateTime: '2026-10-30T16:00',
				endId: 'end',
				onEndDateTimeChange: () => {},
				onStartDateTimeChange: () => {},
				onTimeZoneChange: () => {},
				endPickerMode: 'date-time',
				startDateTime: '2026-10-29T10:00',
				startId: 'start',
				startPickerMode: 'time'
			}
		}).body;

		expect(html).not.toContain('Open calendar for Start');
		expect(html).toContain('Open calendar for End');
	});
});
