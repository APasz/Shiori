import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DateTimeInput from './DateTimeInput.svelte';
import TimePicker from './TimePicker.svelte';
import { adjustLocalTimeHour, quickTimes } from './time-picker';

describe('time picker quick times', () => {
	it('provides the shared default quick-time list', () => {
		expect(quickTimes).toEqual(['08:00', '10:00', '12:00', '15:00', '18:00', '21:00']);
	});
});

describe('TimePicker', () => {
	it('renders the shared quick times and hour controls', () => {
		const html = render(TimePicker, {
			props: { id: 'start-time', label: 'Start time', onChange: () => {}, value: '10:00' }
		}).body;

		for (const time of quickTimes) {
			expect(html).toContain(time);
		}
		expect(html).toContain('aria-label="Increase hour"');
		expect(html).toContain('aria-label="Decrease hour"');
	});

	it('can hide quick times without hiding the hour controls', () => {
		const html = render(TimePicker, {
			props: {
				id: 'start-time',
				label: 'Start time',
				onChange: () => {},
				showQuickTimes: false,
				value: '10:00'
			}
		}).body;

		expect(html).not.toContain('aria-label="Common times"');
		expect(html).toContain('aria-label="Increase hour"');
		expect(html).toContain('aria-label="Decrease hour"');
	});

	it('disables the hour controls when its value is incomplete', () => {
		const html = render(TimePicker, {
			props: { id: 'start-time', label: 'Start time', onChange: () => {}, value: '' }
		}).body;

		expect(html).toMatch(/aria-label="Increase hour" disabled/);
		expect(html).toMatch(/aria-label="Decrease hour" disabled/);
	});

	it('renders disabled controls', () => {
		const html = render(TimePicker, {
			props: { disabled: true, id: 'start-time', label: 'Start time', onChange: () => {}, value: '10:00' }
		}).body;

		expect(html).toContain('aria-label="Start time"');
		expect(html).toMatch(/aria-label="Increase hour" disabled/);
		expect(html).toMatch(/aria-label="Decrease hour" disabled/);
	});
});

describe('DateTimeInput', () => {
	for (const pickerMode of ['time', 'date-time'] as const) {
		it(`forwards the quick-time option to its ${pickerMode} picker`, () => {
			const html = render(DateTimeInput, {
				props: {
					dateTime: '2026-04-12T10:00',
					id: 'start-time',
					label: 'Start time',
					onDateTimeChange: () => {},
					pickerMode,
					showQuickTimes: false,
					showTimeZonePicker: false
				}
			}).body;

			expect(html).not.toContain('aria-label="Common times"');
			expect(html).toContain('aria-label="Increase hour"');
		});
	}
});

describe('adjustLocalTimeHour', () => {
	it('adjusts an hour while preserving minutes', () => {
		expect(adjustLocalTimeHour('10:45', 1)).toBe('11:45');
		expect(adjustLocalTimeHour('10:45', -1)).toBe('09:45');
	});

	it('wraps across midnight', () => {
		expect(adjustLocalTimeHour('23:30', 1)).toBe('00:30');
		expect(adjustLocalTimeHour('00:30', -1)).toBe('23:30');
	});

	it('rejects incomplete or invalid times', () => {
		expect(adjustLocalTimeHour('', 1)).toBeNull();
		expect(adjustLocalTimeHour('24:00', -1)).toBeNull();
	});
});
