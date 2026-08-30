import { stringify } from 'yaml';
import { defaultFormatPreferences, formatTime, type DateFormat, type TimeFormat } from '$lib/format-preferences';
import { currencyFractionDigits } from '$lib/money';
import type {
	Cost,
	CurrencyCode,
	DocumentReference,
	ItineraryItem,
	ItineraryLink,
	ItineraryLocation,
	ItineraryNote,
	ItineraryTiming,
	Reservation,
	TransportDetails
} from './schema';
import { formatCalendarDate, formatCalendarDateTime, type CalendarLocale } from './calendar';
import { timingStartTimestamp } from './timing';
import { formatTimestampInTimeZone } from './time';
import { resolveTimingTimeZone, resolveTransportStopTimeZone } from './time-zone';

export const itineraryExportFormats = ['json', 'yaml', 'txt'] as const;
/** Bumped whenever the portable itinerary export shape changes. */
export const itineraryExportVersion = 2;

export type ItineraryExportFormat = (typeof itineraryExportFormats)[number];

export type ItineraryTextFormatOptions = Readonly<{
	dateFormat: DateFormat;
	locale: CalendarLocale;
	timeFormat: TimeFormat;
}>;

export const defaultItineraryTextFormatOptions: ItineraryTextFormatOptions = {
	...defaultFormatPreferences,
	locale: null
};

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
	normalizeCostAmounts: true,
	useEpochTimestamps: false
};

type BasicItineraryItem = Pick<ItineraryItem, 'id' | 'timing' | 'title' | 'type'>;

export type ItineraryExportSource = Readonly<{
	title: string;
	timeZone: string;
	localCurrency?: CurrencyCode;
	items: readonly (BasicItineraryItem | ItineraryItem)[];
	notes?: readonly ItineraryNote[];
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
	code?: string;
	role: ItineraryLocation['role'];
	name: string;
	address?: string;
	coordinates?: Readonly<{ latitude: number; longitude: number }>;
	googleMapsUrl?: string;
	openRailwayMapUrl?: string;
}>;

type ExportedTransportStop = Readonly<{
	code?: string;
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
			amountMinor: number;
			currency: CurrencyCode;
			scheduledPaymentDate?: string;
			status: 'unpaid';
	  }>
	| Readonly<{
			amountMinor: number;
			currency: CurrencyCode;
			scheduledPaymentDate?: string;
			status: 'paid';
			payment: Readonly<{
				exchangeRate: number;
				localAmountMinor: number;
				localCurrency: CurrencyCode;
				paidAt: number | string;
				rateDate: string;
			}>;
	  }>
	| Readonly<{
			amount: number;
			currency: CurrencyCode;
			scheduledPaymentDate?: string;
			status: 'unpaid';
	  }>
	| Readonly<{
			amount: number;
			currency: CurrencyCode;
			scheduledPaymentDate?: string;
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

type ExportedEstimatedNoteCost = Readonly<{
	amountMinor: number;
	currency: CurrencyCode;
	label?: string;
}>;

type ExportedNoteEntry = Readonly<{
	estimatedCosts: ExportedEstimatedNoteCost[];
	links: ItineraryLink[];
	note?: string;
	state: ItineraryNote['entries'][number]['state'];
	endTime?: string;
	startTime?: string;
	title: string;
}>;

type ExportedItineraryNote =
	| Readonly<{
			entries: ExportedNoteEntry[];
			kind: 'trip';
			text: string;
			timeZone: string;
	  }>
	| Readonly<{
			anchorAt: number | string;
			entries: ExportedNoteEntry[];
			kind: 'day';
			text: string;
			timeZone: string;
	  }>;

export type ItineraryExport = Readonly<{
	version: typeof itineraryExportVersion;
	title: string;
	timeZone: string;
	localCurrency?: CurrencyCode;
	items: ExportedItem[];
	notes?: ExportedItineraryNote[];
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
		...(location.code === undefined ? {} : { code: location.code }),
		...(location.address === undefined ? {} : { address: location.address }),
		...(includeCoordinates && location.coordinates !== undefined ? { coordinates: location.coordinates } : {}),
		...(location.googleMapsUrl === undefined ? {} : { googleMapsUrl: location.googleMapsUrl }),
		...(location.openRailwayMapUrl === undefined ? {} : { openRailwayMapUrl: location.openRailwayMapUrl })
	}));
}

function locationForId(item: ItineraryItem, locationId: string): ItineraryLocation | undefined {
	return item.locations.find((location) => location.id === locationId);
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
		stops: item.transport.stops.map((stop) => {
			const location = locationForId(item, stop.locationId);
			return {
				location: location?.name ?? stop.locationId,
				...(location?.code === undefined ? {} : { code: location.code }),
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
			};
		})
	};
}

function normalizeCostAmount(amount: number, currency: CurrencyCode): number {
	return amount / 10 ** currencyFractionDigits(currency);
}

function exportCost(cost: Cost, options: ItineraryExportOptions): ExportedCost {
	const scheduledPaymentDate = cost.scheduledPaymentDate ? { scheduledPaymentDate: cost.scheduledPaymentDate } : {};
	if (!options.normalizeCostAmounts) {
		if (cost.status === 'unpaid') {
			return { amountMinor: cost.amountMinor, currency: cost.currency, ...scheduledPaymentDate, status: 'unpaid' };
		}

		return {
			amountMinor: cost.amountMinor,
			currency: cost.currency,
			...scheduledPaymentDate,
			status: 'paid',
			payment: {
				exchangeRate: cost.payment.exchangeRate,
				localAmountMinor: cost.payment.localAmountMinor,
				localCurrency: cost.payment.localCurrency,
				paidAt: exportTimestampValue(cost.payment.paidAt, options.useEpochTimestamps),
				rateDate: cost.payment.rateDate
			}
		};
	}

	const amount = normalizeCostAmount(cost.amountMinor, cost.currency);
	if (cost.status === 'unpaid') {
		return { amount, currency: cost.currency, ...scheduledPaymentDate, status: 'unpaid' };
	}

	return {
		amount,
		currency: cost.currency,
		...scheduledPaymentDate,
		status: 'paid',
		payment: {
			exchangeRate: cost.payment.exchangeRate,
			localAmount: normalizeCostAmount(cost.payment.localAmountMinor, cost.payment.localCurrency),
			localCurrency: cost.payment.localCurrency,
			paidAt: exportTimestampValue(cost.payment.paidAt, options.useEpochTimestamps),
			rateDate: cost.payment.rateDate
		}
	};
}

function isNormalizedCost(cost: ExportedCost): cost is Extract<ExportedCost, { amount: number }> {
	return 'amount' in cost;
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

function exportItineraryNote(note: ItineraryNote, options: ItineraryExportOptions): ExportedItineraryNote {
	const entries = note.entries.map((entry) => ({
		estimatedCosts: entry.estimatedCosts.map((estimatedCost) => ({
			amountMinor: estimatedCost.amountMinor,
			currency: estimatedCost.currency,
			...(estimatedCost.label === undefined ? {} : { label: estimatedCost.label })
		})),
		links: entry.links.map((link) => ({ ...link })),
		...(entry.note === undefined ? {} : { note: entry.note }),
		state: entry.state,
		...(entry.endTime === undefined ? {} : { endTime: entry.endTime }),
		...(entry.startTime === undefined ? {} : { startTime: entry.startTime }),
		title: entry.title
	}));
	const base = { entries, text: note.text, timeZone: note.timeZone };
	return note.kind === 'trip'
		? { ...base, kind: 'trip' }
		: { ...base, anchorAt: exportTimestampValue(note.anchorAt, options.useEpochTimestamps), kind: 'day' };
}

/** Creates the stable, portable itinerary data shared by every export format. */
export function createItineraryExport(source: ItineraryExportSource, options: ItineraryExportOptions): ItineraryExport {
	return {
		version: itineraryExportVersion,
		title: source.title,
		timeZone: source.timeZone,
		...(source.localCurrency === undefined ? {} : { localCurrency: source.localCurrency }),
		items: [...source.items].sort(compareItems).map((item) => exportItem(item, source.timeZone, options)),
		...(options.includeNotes && source.notes !== undefined
			? { notes: source.notes.map((note) => exportItineraryNote(note, options)) }
			: {})
	};
}

function timestampText(timestamp: ExportedTimestamp, textFormat: ItineraryTextFormatOptions): string {
	if (typeof timestamp.at === 'number') {
		return `${timestamp.at} (epoch milliseconds; ${timestamp.timeZone})`;
	}

	const local = formatTimestampInTimeZone(Date.parse(timestamp.at), timestamp.timeZone);
	return local === null
		? `${timestamp.at} (${timestamp.timeZone})`
		: `${formatCalendarDateTime(
				local.date,
				local.time,
				'date',
				textFormat.locale,
				textFormat.dateFormat,
				textFormat.timeFormat
			)} (${timestamp.timeZone})`;
}

function timingText(timing: ExportedTiming, textFormat: ItineraryTextFormatOptions): string {
	switch (timing.kind) {
		case 'exact':
			return timing.end === undefined
				? timestampText(timing.start, textFormat)
				: `${timestampText(timing.start, textFormat)} – ${timestampText(timing.end, textFormat)}`;
		case 'approximate':
			return `Approximately ${timestampText(timing.nominal, textFormat)} (±${timing.toleranceMinutes} minutes)`;
		case 'window':
			return `Between ${timestampText(timing.earliest, textFormat)} and ${timestampText(timing.latest, textFormat)}`;
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

function textLinesForItem(item: ExportedItem, index: number, textFormat: ItineraryTextFormatOptions): string[] {
	const lines = [`${index + 1}. ${item.title} (${item.type})`, `   When: ${timingText(item.timing, textFormat)}`];
	if (item.locations && item.locations.length > 0) {
		lines.push('   Locations:');
		for (const location of item.locations) {
			const code = location.code === undefined ? '' : ` · ${location.code}`;
			const address = location.address === undefined ? '' : ` — ${location.address}`;
			const coordinates =
				location.coordinates === undefined
					? ''
					: ` · ${location.coordinates.latitude}, ${location.coordinates.longitude}`;
			lines.push(`     - ${location.name} (${location.role})${code}${address}${coordinates}`);
		}
	}
	if (item.transport) {
		const details = [item.transport.operator, item.transport.serviceNumber, item.transport.seat].filter(
			(detail) => detail !== undefined
		);
		lines.push(`   Transport: ${item.transport.mode}${details.length === 0 ? '' : ` · ${details.join(' · ')}`}`);
		for (const stop of item.transport.stops) {
			const code = stop.code === undefined ? '' : ` · ${stop.code}`;
			const schedule = stop.scheduledAt === undefined ? '' : ` — ${timestampText(stop.scheduledAt, textFormat)}`;
			const platform = stop.platform === undefined ? '' : ` · Platform ${stop.platform}`;
			lines.push(`     - ${stop.location}${code}${schedule}${platform}`);
		}
	}
	if (item.reservation) {
		lines.push(`   Reservation: ${reservationText(item.reservation)}`);
	}
	if (item.cost) {
		const costText = isNormalizedCost(item.cost)
			? monetaryAmountText(item.cost.amount, item.cost.currency, true)
			: monetaryAmountText(item.cost.amountMinor, item.cost.currency, false);
		lines.push(`   Cost: ${costText} (${item.cost.status})`);
		if (item.cost.scheduledPaymentDate) {
			const scheduledPaymentDate =
				formatCalendarDate(item.cost.scheduledPaymentDate, 'date', textFormat.locale, textFormat.dateFormat) ??
				item.cost.scheduledPaymentDate;
			lines.push(`     Scheduled payment: ${scheduledPaymentDate}`);
		}
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

function noteEntryTimeText(entry: ExportedNoteEntry, timeFormat: TimeFormat): string | undefined {
	if (entry.startTime !== undefined && entry.endTime !== undefined) {
		return `${formatTime(entry.startTime, timeFormat)}–${formatTime(entry.endTime, timeFormat)}`;
	}

	const time = entry.startTime ?? entry.endTime;
	return time === undefined ? undefined : formatTime(time, timeFormat);
}

function textLinesForItineraryNote(
	note: ExportedItineraryNote,
	index: number,
	textFormat: ItineraryTextFormatOptions
): string[] {
	const title =
		note.kind === 'trip'
			? 'Trip note'
			: `Day note · ${timestampText({ at: note.anchorAt, timeZone: note.timeZone }, textFormat)}`;
	const lines = [`${index + 1}. ${title}${note.kind === 'trip' ? ` (${note.timeZone})` : ''}`];
	if (note.text !== '') {
		lines.push(`   ${note.text.replaceAll('\n', '\n   ')}`);
	}
	for (const entry of note.entries) {
		const time = noteEntryTimeText(entry, textFormat.timeFormat);
		const state = entry.state === 'idea' ? '' : ` · ${entry.state}`;
		lines.push(`   - ${entry.title}${state}`);
		if (time !== undefined) {
			lines.push(`     Time: ${time}`);
		}
		if (entry.note !== undefined) {
			lines.push(`     Details: ${entry.note.replaceAll('\n', '\n       ')}`);
		}
		for (const estimatedCost of entry.estimatedCosts) {
			const label = estimatedCost.label === undefined ? '' : `${estimatedCost.label}: `;
			lines.push(`     Estimate: ${label}${estimatedCost.currency} ${estimatedCost.amountMinor} minor units`);
		}
		for (const link of entry.links) {
			lines.push(`     Link: ${link.label}: ${link.url}`);
		}
	}
	return lines;
}

function plainTextExport(itinerary: ItineraryExport, textFormat: ItineraryTextFormatOptions): string {
	const lines = [itinerary.title, `Time zone: ${itinerary.timeZone}`];
	if (itinerary.localCurrency !== undefined) {
		lines.push(`Local currency: ${itinerary.localCurrency}`);
	}
	lines.push('');

	if (itinerary.items.length === 0) {
		lines.push('No items planned.');
	} else {
		for (const [index, item] of itinerary.items.entries()) {
			lines.push(...textLinesForItem(item, index, textFormat), '');
		}
	}
	if (itinerary.notes && itinerary.notes.length > 0) {
		lines.push('Notes:');
		for (const [index, note] of itinerary.notes.entries()) {
			lines.push(...textLinesForItineraryNote(note, index, textFormat), '');
		}
	}

	return `${lines.join('\n').trimEnd()}\n`;
}

/** Renders an itinerary export in the selected portable or human-readable format. */
export function renderItineraryExport(
	source: ItineraryExportSource,
	format: ItineraryExportFormat,
	options: ItineraryExportOptions,
	textFormat: ItineraryTextFormatOptions = defaultItineraryTextFormatOptions
): string {
	const itinerary = createItineraryExport(source, options);
	switch (format) {
		case 'json':
			return `${JSON.stringify(itinerary, null, 2)}\n`;
		case 'yaml':
			return stringify(itinerary);
		case 'txt':
			return plainTextExport(itinerary, textFormat);
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
	options: ItineraryExportOptions,
	textFormat: ItineraryTextFormatOptions = defaultItineraryTextFormatOptions
): ItineraryExportFile {
	const metadata = itineraryExportFormatMetadata[format];
	return {
		contents: renderItineraryExport(source, format, options, textFormat),
		filename: `${filenameStem(source.title)}-itinerary.${metadata.extension}`,
		mediaType: metadata.mediaType
	};
}
