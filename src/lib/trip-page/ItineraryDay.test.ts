import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { itineraryItemSchema } from '$lib/itinerary/schema';
import ItineraryDay from './ItineraryDay.svelte';
import type { DayItem } from './types';

function renderDay(noteActionLabel: string, items: DayItem[] = [], availabilityTimestamp = 0): string {
	return render(ItineraryDay, {
		props: {
			availabilityTimestamp,
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

describe('itinerary day', () => {
	it('shows the structured note count only when entries exist', () => {
		expect(renderDay('Notes 2')).toContain('Notes 2');
		expect(renderDay('Notes')).not.toContain('Notes 0');
	});

	it('marks a day with a freeform note', () => {
		expect(renderDay('Notes 2 日')).toContain('Notes 2 日');
		expect(renderDay('Notes 日')).toContain('Notes 日');
	});

	it('shows the next availability entry instead of an unplanned time', () => {
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
					timing: { at: Date.UTC(2026, 3, 13, 15, 30), kind: 'until', timeZone: 'UTC' },
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

	it('keeps a day-placed item with no usable availability visible without a time', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'reception-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 13, 16),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 13, 10),
						timeZone: 'UTC'
					},
					type: 'reception-hours'
				}
			],
			id: 'hotel',
			placement: { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: 'UTC' },
			title: 'Hotel',
			type: 'activity'
		});

		const html = renderDay('Notes', [item]);

		expect(html).toContain('Hotel');
		expect(html).toContain('Time not set');
		expect(html).not.toContain('Reception');
	});

	it('uses an explicit first transport-stop time for a day-placed journey', () => {
		const item = itineraryItemSchema.parse({
			id: 'airport-train',
			locations: [{ id: 'departure', name: 'Central Station', role: 'departure' }],
			placement: { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: 'UTC' },
			title: 'Airport train',
			transport: {
				mode: 'rail',
				stops: [{ locationId: 'departure', scheduledAt: Date.UTC(2026, 3, 13, 10) }]
			},
			type: 'transport'
		});

		const html = renderDay('Notes', [item]);

		expect(html).toContain('datetime="2026-04-13T10:00:00.000Z"');
		expect(html).not.toContain('Time not set');
	});

	it('uses a first transport service time before opening-hours availability', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'station-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 13, 18),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 13, 8),
						timeZone: 'UTC'
					},
					type: 'opening-hours'
				}
			],
			id: 'airport-train-with-hours',
			locations: [{ id: 'departure', name: 'Central Station', role: 'departure' }],
			placement: { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: 'UTC' },
			title: 'Airport train',
			transport: {
				mode: 'rail',
				stops: [{ locationId: 'departure', scheduledAt: Date.UTC(2026, 3, 13, 10) }]
			},
			type: 'transport'
		});

		const html = renderDay('Notes', [item]);

		expect(html).toContain('datetime="2026-04-13T10:00:00.000Z"');
		expect(html).not.toContain('Opening');
	});

	it('uses the current or next chronological availability entry on a day card', () => {
		const item = itineraryItemSchema.parse({
			availability: [
				{
					id: 'afternoon-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 13, 16),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 13, 13),
						timeZone: 'UTC'
					},
					type: 'opening-hours'
				},
				{
					id: 'morning-hours',
					timing: {
						endAt: Date.UTC(2026, 3, 13, 11),
						kind: 'period',
						startAt: Date.UTC(2026, 3, 13, 9),
						timeZone: 'UTC'
					},
					type: 'opening-hours'
				}
			],
			id: 'museum-split-hours',
			placement: { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: 'UTC' },
			title: 'Museum',
			type: 'activity'
		});

		const currentHtml = renderDay('Notes', [item], Date.UTC(2026, 3, 13, 10));
		const nextHtml = renderDay('Notes', [item], Date.UTC(2026, 3, 13, 12));

		expect(currentHtml).toContain('09:00–11:00');
		expect(currentHtml).not.toContain('13:00–16:00');
		expect(nextHtml).toContain('13:00–16:00');
		expect(nextHtml).not.toContain('09:00–11:00');
	});
});
