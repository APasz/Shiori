import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ItineraryNoteEditor from './ItineraryNoteEditor.svelte';
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

describe('disabled note time-zone picker', () => {
	it('renders a disabled control', () => {
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

		expect(timeZonePicker).toContain('disabled');
		expect(timeZonePicker).toContain('aria-label="Note time zone"');
	});
});
