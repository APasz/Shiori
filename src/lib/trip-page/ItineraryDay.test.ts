import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ItineraryDay from './ItineraryDay.svelte';

function renderDay(noteActionLabel: string): string {
	return render(ItineraryDay, {
		props: {
			canModifyItinerary: true,
			canSelectItems: false,
			date: '2026-04-13',
			dayNumber: 1,
			isOpen: true,
			items: [],
			noteActionLabel,
			onCreateItem: () => {},
			onDisclosureChange: () => {},
			onEditDayNote: () => {},
			onSelectItem: () => {},
			selectedItemId: null,
			tripTimeZone: 'UTC'
		}
	}).body;
}

describe('itinerary day note action', () => {
	it('shows the structured note count only when entries exist', () => {
		expect(renderDay('Notes 2')).toContain('Notes 2');
		expect(renderDay('Notes')).not.toContain('Notes 0');
	});

	it('marks a day with a freeform note', () => {
		expect(renderDay('Notes 2 日')).toContain('Notes 2 日');
		expect(renderDay('Notes 日')).toContain('Notes 日');
	});
});
