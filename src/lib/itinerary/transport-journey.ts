import { z } from 'zod';
import type { ItineraryItemImport } from '$lib/editing/contracts';
import {
	calendarDateSchema,
	googleMapsUrlSchema,
	itineraryItemSchema,
	itineraryLinkSchema,
	locationCoordinatesSchema,
	transportModeSchema,
	type ItineraryItem,
	type TransportDetails
} from './schema';
import { transportJourneyScheduleSchema, type TransportJourneySchedule } from './transport-schedule';

const nonEmptyTextSchema = z.string().trim().min(1, 'This value cannot be empty.');
const transportTitleSuffixPattern =
	/\s+(?:(?:international|domestic|regional)\s+)?airport$|\s+(?:railway\s+)?station$/i;

export const transportJourneyEndpointSchema = z.strictObject({
	coordinates: locationCoordinatesSchema.optional(),
	googleMapsUrl: googleMapsUrlSchema.optional(),
	name: nonEmptyTextSchema
});

export const transportJourneyDraftSchema = z.strictObject({
	arrival: transportJourneyEndpointSchema,
	departure: transportJourneyEndpointSchema,
	mode: transportModeSchema,
	operator: nonEmptyTextSchema.optional(),
	serviceNumber: nonEmptyTextSchema.optional(),
	sourceLinks: z.array(itineraryLinkSchema),
	schedule: transportJourneyScheduleSchema.optional(),
	suggestedStartDate: calendarDateSchema.optional(),
	title: nonEmptyTextSchema.optional()
});

export type TransportJourneyEndpoint = z.infer<typeof transportJourneyEndpointSchema>;
export type TransportJourneyDraft = z.infer<typeof transportJourneyDraftSchema>;

function locationForEndpoint(
	endpoint: TransportJourneyEndpoint,
	role: 'departure' | 'arrival'
): ItineraryItem['locations'][number] {
	return {
		id: crypto.randomUUID(),
		name: endpoint.name,
		role,
		...(endpoint.coordinates ? { coordinates: endpoint.coordinates } : {}),
		...(endpoint.googleMapsUrl ? { googleMapsUrl: endpoint.googleMapsUrl } : {})
	};
}

export function conciseTransportEndpointName(name: string): string {
	const trimmedName = name.trim();
	const conciseName = trimmedName.replace(transportTitleSuffixPattern, '').trim();
	return conciseName || trimmedName;
}

export function transportRouteTitle(departureName: string, arrivalName: string): string {
	return `${conciseTransportEndpointName(departureName)} > ${conciseTransportEndpointName(arrivalName)}`;
}

export function transportJourneyTitle(journey: TransportJourneyDraft): string {
	return journey.title ?? transportRouteTitle(journey.departure.name, journey.arrival.name);
}

export function transportJourneyDraftFromImport(itemImport: ItineraryItemImport): TransportJourneyDraft {
	if (itemImport.type !== 'transport') {
		throw new Error('Only transport imports can be used to create a transport journey.');
	}

	const departure = itemImport.locations.find((location) => location.role === 'departure');
	const arrival = itemImport.locations.find((location) => location.role === 'arrival');
	if (!departure || !arrival) {
		throw new Error('A transport import needs both a departure and an arrival location.');
	}

	return {
		departure: {
			name: departure.name,
			...(departure.coordinates ? { coordinates: departure.coordinates } : {}),
			...(departure.googleMapsUrl ? { googleMapsUrl: departure.googleMapsUrl } : {})
		},
		arrival: {
			name: arrival.name,
			...(arrival.coordinates ? { coordinates: arrival.coordinates } : {}),
			...(arrival.googleMapsUrl ? { googleMapsUrl: arrival.googleMapsUrl } : {})
		},
		mode: itemImport.transport.mode,
		sourceLinks: itemImport.links,
		title: itemImport.title,
		...(itemImport.transport.schedule ? { schedule: itemImport.transport.schedule } : {}),
		...(itemImport.suggestedStartDate ? { suggestedStartDate: itemImport.suggestedStartDate } : {}),
		...(itemImport.transport.operator ? { operator: itemImport.transport.operator } : {}),
		...(itemImport.transport.serviceNumber ? { serviceNumber: itemImport.transport.serviceNumber } : {})
	};
}

export function createTransportJourneyItem(journey: TransportJourneyDraft, id: string, startAt: number): ItineraryItem {
	const validatedJourney = transportJourneyDraftSchema.parse(journey);
	const locations = [
		locationForEndpoint(validatedJourney.departure, 'departure'),
		locationForEndpoint(validatedJourney.arrival, 'arrival')
	];
	const schedule = validatedJourney.schedule;
	const timingTimeZone = schedule?.departure.timeZone;
	const stopForLocation = (
		locationId: string,
		stopSchedule: TransportJourneySchedule['departure'] | undefined
	): TransportDetails['stops'][number] => ({
		locationId,
		...(stopSchedule ? { scheduledAt: stopSchedule.scheduledAt } : {}),
		...(stopSchedule && stopSchedule.timeZone !== timingTimeZone ? { timeZone: stopSchedule.timeZone } : {})
	});
	const transport: TransportDetails = {
		mode: validatedJourney.mode,
		stops: [stopForLocation(locations[0].id, schedule?.departure), stopForLocation(locations[1].id, schedule?.arrival)],
		...(validatedJourney.operator ? { operator: validatedJourney.operator } : {}),
		...(validatedJourney.serviceNumber ? { serviceNumber: validatedJourney.serviceNumber } : {})
	};

	return itineraryItemSchema.parse({
		id,
		type: 'transport',
		title: transportJourneyTitle(validatedJourney),
		timing: {
			kind: 'exact',
			startAt: schedule?.departure.scheduledAt ?? startAt,
			...(timingTimeZone ? { timeZone: timingTimeZone } : {})
		},
		locations,
		notes: [],
		links: validatedJourney.sourceLinks,
		documents: [],
		transport
	});
}
