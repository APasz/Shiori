import type { ItineraryLocation } from './schema';

const transportStopScheduledTimeLabels = {
	arrival: 'Scheduled arrival',
	departure: 'Scheduled departure',
	'meeting-point': 'Scheduled stop',
	primary: 'Scheduled stop',
	via: 'Scheduled stop'
} as const satisfies Record<ItineraryLocation['role'], string>;

/** Labels a factual transport stop time without conflating it with the item's Plan. */
export function transportStopScheduledTimeLabel(role: ItineraryLocation['role']): string {
	return transportStopScheduledTimeLabels[role];
}
