import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { itineraryItemSchema } from '$lib/itinerary/schema';
import ItineraryDay from './ItineraryDay.svelte';
import type { DayItem } from './types';

function renderDay(noteActionLabel: string, items: DayItem[] = []): string {
	return render(ItineraryDay, {
		props: {
			canModifyItinerary: true,
			canSelectItems: false,
			date: '2026-04-13',
			dayNumber: 1,
			isOpen: true,
			items,
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

	it('shows the first availability entry instead of an unscheduled time', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'opening-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 13, 16),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 13, 10),
						timeZone: 'UTC'
					},
					type: 'opening-hours'
				},
				{
					id: 'last-admission',
					timing: { at: Date.UTC(2026, 3, 13, 15, 30), kind: 'deadline', timeZone: 'UTC' },
					type: 'last-admission'
				}
			],
			id: 'museum',
			placement: { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: 'UTC' },
			title: 'Museum',
			type: 'activity'
		});

		const html = renderDay('Notes', [item]);

		expect(html).toContain('Opening');
		expect(html).toContain('10:00–16:00');
		expect(html).not.toContain('Admission');
		expect(html).not.toContain('Time not set');
	});
});
