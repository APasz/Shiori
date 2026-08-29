import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ItineraryNoteEditor from './ItineraryNoteEditor.svelte';
import TimePicker from './TimePicker.svelte';
import TimeZonePicker from './TimeZonePicker.svelte';

describe('itinerary note editor', () => {
	it('keeps an unreachable server visible to the editor user', () => {
		const html = render(ItineraryNoteEditor, {
			props: {
				defaultTimeZone: 'UTC',
				initialNote: undefined,
				isServerReachable: false,
				localCurrency: 'AUD',
				notesEndpoint: '/api/trips/trip-1/notes',
				onDismiss: () => {},
				onSaved: async () => {},
				revision: 1,
				target: { kind: 'trip' }
			}
		}).body;

		expect(html).toContain('Connection lost. Your draft remains open; reconnect to save it.');
	});

	it('disables deletion while the server is unreachable', () => {
		const html = render(ItineraryNoteEditor, {
			props: {
				defaultTimeZone: 'UTC',
				initialNote: { entries: [], kind: 'trip', text: 'Keep this.', timeZone: 'UTC' },
				isServerReachable: false,
				localCurrency: 'AUD',
				notesEndpoint: '/api/trips/trip-1/notes',
				onDismiss: () => {},
				onSaved: async () => {},
				revision: 1,
				target: { kind: 'trip' }
			}
		}).body;

		expect(html).toMatch(/class="delete-note[^"]*" disabled/);
	});
});

describe('disabled note pickers', () => {
	it('renders disabled controls', () => {
		const timePicker = render(TimePicker, {
			props: { disabled: true, id: 'start-time', label: 'Start time', onChange: () => {}, value: '09:00' }
		}).body;
		const timeZonePicker = render(TimeZonePicker, {
			props: {
				disabled: true,
				id: 'time-zone',
				label: 'Note time zone',
				onSelect: () => {},
				options: [],
				value: 'UTC'
			}
		}).body;

		expect(timePicker).toContain('disabled');
		expect(timePicker).toContain('aria-label="Start time"');
		expect(timeZonePicker).toContain('disabled');
		expect(timeZonePicker).toContain('aria-label="Note time zone"');
	});
});
