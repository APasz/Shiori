import type { ItineraryItem, ItineraryItemType, ItineraryLocation } from './schema';
import type { ItineraryItemImport } from '$lib/editing/contracts';

export function createEmptyItineraryItem(type: ItineraryItemType, id: string, startAt: number): ItineraryItem {
	const common = {
		id,
		timing: { kind: 'exact' as const, startAt },
		title: '',
		locations: [],
		notes: [],
		links: [],
		documents: []
	};

	if (type === 'transport') {
		return {
			...common,
			type,
			transport: {
				mode: 'other',
				stops: []
			}
		};
	}

	return { ...common, type };
}

export function createItineraryItemFromImport(
	itemImport: ItineraryItemImport,
	id: string,
	startAt: number
): ItineraryItem {
	const locations: ItineraryLocation[] = itemImport.locations.map((location) => ({
		...location,
		id: crypto.randomUUID()
	}));
	const common = {
		id,
		timing: { kind: 'exact' as const, startAt },
		title: itemImport.title,
		locations,
		notes: [],
		links: itemImport.links,
		documents: []
	};

	if (itemImport.type !== 'transport') {
		return { ...common, type: itemImport.type };
	}

	return {
		...common,
		type: 'transport',
		transport: {
			mode: itemImport.transport.mode,
			...(itemImport.transport.operator ? { operator: itemImport.transport.operator } : {}),
			...(itemImport.transport.serviceNumber ? { serviceNumber: itemImport.transport.serviceNumber } : {}),
			stops: locations.map((location) => ({ locationId: location.id }))
		}
	};
}
