import { stringify } from 'yaml';
import { currencyFractionDigits } from '$lib/money';
import type {
	Cost,
	CurrencyCode,
	DocumentReference,
	ItineraryItem,
	ItineraryLink,
	ItineraryLocation,
	ItineraryTiming,
	Reservation,
	TransportDetails
} from './schema';
import { timingStartTimestamp } from './timing';
import { resolveTimingTimeZone, resolveTransportStopTimeZone } from './time-zone';

export const itineraryExportFormats = ['json', 'yaml', 'txt'] as const;

export type ItineraryExportFormat = (typeof itineraryExportFormats)[number];

export const itineraryExportFormatMetadata = {
	json: { extension: 'json', label: 'JSON', mediaType: 'application/json' },
	yaml: { extension: 'yaml', label: 'YAML', mediaType: 'application/yaml' },
	txt: { extension: 'txt', label: 'Plain text', mediaType: 'text/plain' }
} as const satisfies Record<ItineraryExportFormat, ItineraryExportFormatMetadata>;

type ItineraryExportFormatMetadata = Readonly<{
	extension: string;
	label: string;
	mediaType: string;
}>;

export type ItineraryExportOptions = Readonly<{
	includeCoordinates: boolean;
	includeCosts: boolean;
	includeLinksAndDocuments: boolean;
	includeNotes: boolean;
	includeReservationDetails: boolean;
	normalizeCostAmounts: boolean;
	useEpochTimestamps: boolean;
}>;

export const defaultItineraryExportOptions: ItineraryExportOptions = {
	includeCoordinates: true,
	includeCosts: true,
	includeLinksAndDocuments: true,
	includeNotes: true,
	includeReservationDetails: true,
	normalizeCostAmounts: false,
	useEpochTimestamps: false
};

type BasicItineraryItem = Pick<ItineraryItem, 'id' | 'timing' | 'title' | 'type'>;

export type ItineraryExportSource = Readonly<{
	title: string;
	timeZone: string;
	localCurrency?: CurrencyCode;
	items: readonly (BasicItineraryItem | ItineraryItem)[];
}>;

type ExportedTimestamp = Readonly<{
	at: number | string;
	timeZone: string;
}>;

type ExportedTiming =
	| Readonly<{
			kind: 'exact';
			start: ExportedTimestamp;
			end?: ExportedTimestamp;
	  }>
	| Readonly<{
			kind: 'approximate';
			nominal: ExportedTimestamp;
			toleranceMinutes: number;
	  }>
	| Readonly<{
			kind: 'window';
			earliest: ExportedTimestamp;
			latest: ExportedTimestamp;
	  }>;

type ExportedLocation = Readonly<{
	role: ItineraryLocation['role'];
	name: string;
	address?: string;
	coordinates?: Readonly<{ latitude: number; longitude: number }>;
	googleMapsUrl?: string;
	openRailwayMapUrl?: string;
}>;

type ExportedTransportStop = Readonly<{
	location: string;
	scheduledAt?: ExportedTimestamp;
	platform?: string;
}>;

type ExportedTransport = Readonly<{
	mode: TransportDetails['mode'];
	operator?: string;
	serviceNumber?: string;
	seat?: string;
	stops: ExportedTransportStop[];
}>;

type ExportedCost =
	| Readonly<{
			amount: number;
			currency: CurrencyCode;
			status: 'unpaid';
	  }>
	| Readonly<{
			amount: number;
			currency: CurrencyCode;
			status: 'paid';
			payment: Readonly<{
				exchangeRate: number;
				localAmount: number;
				localCurrency: CurrencyCode;
				paidAt: number | string;
				rateDate: string;
			}>;
	  }>;

type ExportedItem = {
	type: BasicItineraryItem['type'];
	title: string;
	timing: ExportedTiming;
	locations?: ExportedLocation[];
	transport?: ExportedTransport;
	notes?: string[];
	links?: ItineraryLink[];
	documents?: DocumentReference[];
	reservation?: Reservation;
	cost?: ExportedCost;
};

export type ItineraryExport = Readonly<{
	version: 1;
	title: string;
	timeZone: string;
	localCurrency?: CurrencyCode;
	items: ExportedItem[];
}>;

export type ItineraryExportFile = Readonly<{
	contents: string;
	filename: string;
	mediaType: string;
}>;

function isDetailedItem(item: BasicItineraryItem | ItineraryItem): item is ItineraryItem {
	return 'locations' in item;
}

function exportTimestampValue(timestamp: number, useEpochTimestamps: boolean): number | string {
	return useEpochTimestamps ? timestamp : new Date(timestamp).toISOString();
}

function exportTimestamp(timestamp: number, timeZone: string, useEpochTimestamps: boolean): ExportedTimestamp {
	return { at: exportTimestampValue(timestamp, useEpochTimestamps), timeZone };
}

function exportTiming(timing: ItineraryTiming, tripTimeZone: string, useEpochTimestamps: boolean): ExportedTiming {
	const timeZone = resolveTimingTimeZone(timing, tripTimeZone);

	switch (timing.kind) {
		case 'exact':
			return {
				kind: 'exact',
				start: exportTimestamp(timing.startAt, timeZone, useEpochTimestamps),
				...(timing.endAt === undefined ? {} : { end: exportTimestamp(timing.endAt, timeZone, useEpochTimestamps) })
			};
		case 'approximate':
			return {
				kind: 'approximate',
				nominal: exportTimestamp(timing.nominalAt, timeZone, useEpochTimestamps),
				toleranceMinutes: timing.toleranceMinutes
			};
		case 'window':
			return {
				kind: 'window',
				earliest: exportTimestamp(timing.earliestAt, timeZone, useEpochTimestamps),
				latest: exportTimestamp(timing.latestAt, timeZone, useEpochTimestamps)
			};
	}
}

function exportLocations(item: ItineraryItem, includeCoordinates: boolean): ExportedLocation[] {
	return item.locations.map((location) => ({
		role: location.role,
		name: location.name,
		...(location.address === undefined ? {} : { address: location.address }),
		...(includeCoordinates && location.coordinates !== undefined ? { coordinates: location.coordinates } : {}),
		...(location.googleMapsUrl === undefined ? {} : { googleMapsUrl: location.googleMapsUrl }),
		...(location.openRailwayMapUrl === undefined ? {} : { openRailwayMapUrl: location.openRailwayMapUrl })
	}));
}

function locationName(item: ItineraryItem, locationId: string): string {
	return item.locations.find((location) => location.id === locationId)?.name ?? locationId;
}

function exportTransport(
	item: Extract<ItineraryItem, { type: 'transport' }>,
	timingTimeZone: string,
	useEpochTimestamps: boolean
): ExportedTransport {
	return {
		mode: item.transport.mode,
		...(item.transport.operator === undefined ? {} : { operator: item.transport.operator }),
		...(item.transport.serviceNumber === undefined ? {} : { serviceNumber: item.transport.serviceNumber }),
		...(item.transport.seat === undefined ? {} : { seat: item.transport.seat }),
		stops: item.transport.stops.map((stop) => ({
			location: locationName(item, stop.locationId),
			...(stop.scheduledAt === undefined
				? {}
				: {
						scheduledAt: exportTimestamp(
							stop.scheduledAt,
							resolveTransportStopTimeZone(stop, timingTimeZone),
							useEpochTimestamps
						)
					}),
			...(stop.platform === undefined ? {} : { platform: stop.platform })
		}))
	};
}

function normalizeCostAmount(amount: number, currency: CurrencyCode): number {
	return amount / 10 ** currencyFractionDigits(currency);
}

function exportCost(cost: Cost, options: ItineraryExportOptions): ExportedCost {
	const amount = options.normalizeCostAmounts ? normalizeCostAmount(cost.amount, cost.currency) : cost.amount;
	if (cost.status === 'unpaid') {
		return { amount, currency: cost.currency, status: 'unpaid' };
	}

	return {
		amount,
		currency: cost.currency,
		status: 'paid',
		payment: {
			exchangeRate: cost.payment.exchangeRate,
			localAmount: options.normalizeCostAmounts
				? normalizeCostAmount(cost.payment.localAmount, cost.payment.localCurrency)
				: cost.payment.localAmount,
			localCurrency: cost.payment.localCurrency,
			paidAt: exportTimestampValue(cost.payment.paidAt, options.useEpochTimestamps),
			rateDate: cost.payment.rateDate
		}
	};
}

function compareItems(left: BasicItineraryItem, right: BasicItineraryItem): number {
	return timingStartTimestamp(left.timing) - timingStartTimestamp(right.timing) || left.id.localeCompare(right.id);
}

function exportItem(
	item: BasicItineraryItem | ItineraryItem,
	tripTimeZone: string,
	options: ItineraryExportOptions
): ExportedItem {
	const exported: ExportedItem = {
		type: item.type,
		title: item.title,
		timing: exportTiming(item.timing, tripTimeZone, options.useEpochTimestamps)
	};

	if (!isDetailedItem(item)) {
		return exported;
	}

	exported.locations = exportLocations(item, options.includeCoordinates);
	if (item.type === 'transport') {
		exported.transport = exportTransport(
			item,
			resolveTimingTimeZone(item.timing, tripTimeZone),
			options.useEpochTimestamps
		);
	}
	if (options.includeNotes) {
		exported.notes = [...item.notes];
	}
	if (options.includeLinksAndDocuments) {
		exported.links = item.links.map((link) => ({ ...link }));
		exported.documents = item.documents.map((document) => ({ ...document }));
	}
	if (options.includeReservationDetails && item.reservation !== undefined) {
		exported.reservation = { ...item.reservation };
	}
	if (options.includeCosts && item.cost !== undefined) {
		exported.cost = exportCost(item.cost, options);
	}

	return exported;
}

/** Creates the stable, portable itinerary data shared by every export format. */
export function createItineraryExport(source: ItineraryExportSource, options: ItineraryExportOptions): ItineraryExport {
	return {
		version: 1,
		title: source.title,
		timeZone: source.timeZone,
		...(source.localCurrency === undefined ? {} : { localCurrency: source.localCurrency }),
		items: [...source.items].sort(compareItems).map((item) => exportItem(item, source.timeZone, options))
	};
}

function timestampText(timestamp: ExportedTimestamp): string {
	return typeof timestamp.at === 'number'
		? `${timestamp.at} (epoch milliseconds; ${timestamp.timeZone})`
		: `${timestamp.at} (${timestamp.timeZone})`;
}

function timingText(timing: ExportedTiming): string {
	switch (timing.kind) {
		case 'exact':
			return timing.end === undefined
				? timestampText(timing.start)
				: `${timestampText(timing.start)} – ${timestampText(timing.end)}`;
		case 'approximate':
			return `Approximately ${timestampText(timing.nominal)} (±${timing.toleranceMinutes} minutes)`;
		case 'window':
			return `Between ${timestampText(timing.earliest)} and ${timestampText(timing.latest)}`;
	}
}

function monetaryAmountText(amount: number, currency: CurrencyCode, isNormalized: boolean): string {
	if (!isNormalized) {
		return `${currency} ${amount} minor units`;
	}

	return `${currency} ${amount.toFixed(currencyFractionDigits(currency))}`;
}

function reservationText(reservation: Reservation): string {
	const details = [reservation.provider, reservation.reference].filter((detail) => detail !== undefined);
	return details.length === 0 ? reservation.status : `${reservation.status} · ${details.join(' · ')}`;
}

function textLinesForItem(item: ExportedItem, index: number, options: ItineraryExportOptions): string[] {
	const lines = [`${index + 1}. ${item.title} (${item.type})`, `   When: ${timingText(item.timing)}`];
	if (item.locations && item.locations.length > 0) {
		lines.push('   Locations:');
		for (const location of item.locations) {
			const address = location.address === undefined ? '' : ` — ${location.address}`;
			const coordinates =
				location.coordinates === undefined
					? ''
					: ` · ${location.coordinates.latitude}, ${location.coordinates.longitude}`;
			lines.push(`     - ${location.name} (${location.role})${address}${coordinates}`);
		}
	}
	if (item.transport) {
		const details = [item.transport.operator, item.transport.serviceNumber, item.transport.seat].filter(
			(detail) => detail !== undefined
		);
		lines.push(`   Transport: ${item.transport.mode}${details.length === 0 ? '' : ` · ${details.join(' · ')}`}`);
		for (const stop of item.transport.stops) {
			const schedule = stop.scheduledAt === undefined ? '' : ` — ${timestampText(stop.scheduledAt)}`;
			const platform = stop.platform === undefined ? '' : ` · Platform ${stop.platform}`;
			lines.push(`     - ${stop.location}${schedule}${platform}`);
		}
	}
	if (item.reservation) {
		lines.push(`   Reservation: ${reservationText(item.reservation)}`);
	}
	if (item.cost) {
		lines.push(
			`   Cost: ${monetaryAmountText(item.cost.amount, item.cost.currency, options.normalizeCostAmounts)} (${item.cost.status})`
		);
	}
	if (item.notes && item.notes.length > 0) {
		lines.push('   Notes:');
		for (const note of item.notes) {
			lines.push(`     - ${note.replaceAll('\n', '\n       ')}`);
		}
	}
	if (item.links && item.links.length > 0) {
		lines.push('   Links:');
		for (const link of item.links) {
			lines.push(`     - ${link.label}: ${link.url}`);
		}
	}
	if (item.documents && item.documents.length > 0) {
		lines.push('   Documents:');
		for (const document of item.documents) {
			lines.push(`     - ${document.title} (${document.kind}): ${document.url}`);
		}
	}
	return lines;
}

function plainTextExport(itinerary: ItineraryExport, options: ItineraryExportOptions): string {
	const lines = [itinerary.title, `Time zone: ${itinerary.timeZone}`];
	if (itinerary.localCurrency !== undefined) {
		lines.push(`Local currency: ${itinerary.localCurrency}`);
	}
	lines.push('');

	if (itinerary.items.length === 0) {
		lines.push('No items planned.');
	} else {
		for (const [index, item] of itinerary.items.entries()) {
			lines.push(...textLinesForItem(item, index, options), '');
		}
	}

	return `${lines.join('\n').trimEnd()}\n`;
}

/** Renders an itinerary export in the selected portable or human-readable format. */
export function renderItineraryExport(
	source: ItineraryExportSource,
	format: ItineraryExportFormat,
	options: ItineraryExportOptions
): string {
	const itinerary = createItineraryExport(source, options);
	switch (format) {
		case 'json':
			return `${JSON.stringify(itinerary, null, 2)}\n`;
		case 'yaml':
			return stringify(itinerary);
		case 'txt':
			return plainTextExport(itinerary, options);
	}
}

function filenameStem(title: string): string {
	const stem = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stem || 'itinerary';
}

export function createItineraryExportFile(
	source: ItineraryExportSource,
	format: ItineraryExportFormat,
	options: ItineraryExportOptions
): ItineraryExportFile {
	const metadata = itineraryExportFormatMetadata[format];
	return {
		contents: renderItineraryExport(source, format, options),
		filename: `${filenameStem(source.title)}-itinerary.${metadata.extension}`,
		mediaType: metadata.mediaType
	};
}
