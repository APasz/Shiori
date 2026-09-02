<script lang="ts">
	import { onMount } from 'svelte';
	import DateRangeInput from '$lib/components/DateRangeInput.svelte';
	import DateTimeInput from '$lib/components/DateTimeInput.svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import TimeZonePicker from '$lib/components/TimeZonePicker.svelte';
	import {
		apiErrorSchema,
		editLockResponseSchema,
		editSaveResponseSchema,
		locationResolveResponseSchema,
		itineraryItemImportResponseSchema,
		type ItineraryItemImport
	} from '$lib/editing/contracts';
	import { accommodationStayDraft, type AccommodationStayValidation } from '$lib/itinerary/accommodation-stay';
	import { formatTime } from '$lib/format-preferences';
	import { addCalendarDays, formatCalendarDate, formatCalendarDateTime } from '$lib/itinerary/calendar';
	import {
		transportJourneyDraftFromImport,
		transportJourneyDraftSchema,
		transportRouteTitle,
		transportJourneyTitle,
		type TransportJourneyDraft
	} from '$lib/itinerary/transport-journey';
	import type { TransportJourneySchedule } from '$lib/itinerary/transport-schedule';
	import { formatTimestampForTimeZoneInput } from '$lib/itinerary/zoned-time';
	import { browserTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import Icon from '$lib/visuals/Icon.svelte';
	import { brandIconFeedback } from '$lib/visuals/brand-feedback.svelte';
	import {
		currencyCodeSchema,
		reservationStatusSchema,
		transportModeSchema,
		type CurrencyCode,
		type ItineraryItemType,
		type ItineraryLink,
		type ReservationStatus,
		type TransportDetails
	} from '$lib/itinerary/schema';

	type CreatorState =
		| 'entry'
		| 'importing'
		| 'review'
		| 'transport-departure'
		| 'transport-arrival'
		| 'transport-details'
		| 'transport-review'
		| 'accommodation-details';
	type TransportEndpointKind = 'departure' | 'arrival';
	type TransportEndpointMapProvider = 'google-maps' | 'open-railway-map';
	type TransportEndpointDraft = {
		code?: string;
		coordinates?: { latitude: number; longitude: number };
		googleMapsUrl: string;
		name: string;
		openRailwayMapUrl: string;
	};
	type ResolvingEndpoint = Readonly<{
		kind: TransportEndpointKind;
		provider: TransportEndpointMapProvider;
	}>;
	type AccommodationLocationDraft = {
		address: string;
		coordinates?: { latitude: number; longitude: number };
		googleMapsUrl: string;
		name: string;
	};
	type AccommodationPropertyStatus = Extract<ItineraryItemImport, { readonly type: 'accommodation' }>['propertyStatus'];
	type ImportedTransportItem = Extract<ItineraryItemImport, { readonly type: 'transport' }>;
	type ImportedAirportCandidate = NonNullable<ImportedTransportItem['locations'][number]['airportCandidates']>[number];
	type AirportCandidateResolution = Readonly<{
		candidates: ImportedAirportCandidate[];
		code: string;
		selectedIndex: number | null;
	}>;

	let {
		tripId,
		tripTimeZone,
		localCurrency,
		initialDate,
		revision,
		onDismiss,
		onAccommodationSaved,
		onManual,
		onImported,
		onTransportJourney
	}: {
		tripId: string;
		tripTimeZone: string;
		localCurrency: CurrencyCode;
		initialDate?: string;
		revision: number;
		onDismiss: () => void;
		onAccommodationSaved: () => Promise<void>;
		onManual: (type: ItineraryItemType) => void;
		onImported: (item: ItineraryItemImport) => void;
		onTransportJourney: (journey: TransportJourneyDraft) => void;
	} = $props();

	let dialogElement = $state<HTMLDialogElement | undefined>(undefined);
	let url = $state('');
	let errorMessage = $state('');
	let creatorState = $state<CreatorState>('entry');
	let importedItems = $state<ItineraryItemImport[]>([]);
	let transportErrorMessage = $state('');
	let resolvingEndpoint = $state<ResolvingEndpoint | null>(null);
	let departure = $state<TransportEndpointDraft>({ googleMapsUrl: '', name: '', openRailwayMapUrl: '' });
	let arrival = $state<TransportEndpointDraft>({ googleMapsUrl: '', name: '', openRailwayMapUrl: '' });
	let transportMode = $state<TransportDetails['mode']>('other');
	let transportOperator = $state('');
	let transportServiceNumber = $state('');
	let transportTitle = $state('');
	let suggestedStartDate = $state('');
	let transportSourceLinks = $state<ItineraryLink[]>([]);
	let transportSchedule = $state<TransportJourneySchedule | undefined>(undefined);
	let airportCandidateResolutions = $state<Partial<Record<TransportEndpointKind, AirportCandidateResolution>>>({});
	let accommodationErrorMessage = $state('');
	let accommodationItemId = $state('');
	let accommodationLocationId = $state('');
	let accommodationLocation = $state<AccommodationLocationDraft>({ address: '', googleMapsUrl: '', name: '' });
	let accommodationCheckInDate = $state('');
	let accommodationCheckInTime = $state('');
	let accommodationCheckOutDate = $state('');
	let accommodationCheckOutTime = $state('');
	let accommodationPropertyStatus = $state<AccommodationPropertyStatus | null>(null);
	let accommodationSourceLinks = $state<ItineraryLink[]>([]);
	let accommodationTimeZone = $state('UTC');
	let accommodationTimesKnown = $state(false);
	let accommodationTimeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	let accommodationReservationEnabled = $state(false);
	let accommodationReservationProvider = $state('');
	let accommodationReservationReference = $state('');
	let accommodationReservationStatus = $state<ReservationStatus>('confirmed');
	let accommodationCostEnabled = $state(false);
	let accommodationCostAmount = $state('');
	let accommodationCostCurrency = $state<CurrencyCode>('AUD');
	let accommodationCostPaid = $state(false);
	let accommodationCostScheduledPaymentDate = $state('');
	let resolvingAccommodationLocation = $state(false);
	let savingAccommodation = $state(false);

	const transportModeOptions = transportModeSchema.options;
	const accommodationReservationStatusOptions = reservationStatusSchema.options;
	const currencyOptions = currencyCodeSchema.options;

	function endpoint(): string {
		return `/api/trips/${encodeURIComponent(tripId)}/items/import`;
	}

	function requireDialogElement(): HTMLDialogElement {
		if (!dialogElement) {
			throw new Error('The item creator dialog is unavailable.');
		}
		return dialogElement;
	}

	function tripEndpoint(): string {
		return `/api/trips/${encodeURIComponent(tripId)}`;
	}

	function itemEndpoint(): string {
		return `${tripEndpoint()}/items`;
	}

	function locationResolveEndpoint(): string {
		return `/api/trips/${encodeURIComponent(tripId)}/locations/resolve`;
	}

	function errorFrom(data: unknown, fallback: string): string {
		const parsed = apiErrorSchema.safeParse(data);
		return parsed.success ? parsed.data.message : fallback;
	}

	async function responseData(response: Response): Promise<unknown> {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}

	async function importUrl(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const value = url.trim();
		if (!value) {
			errorMessage = 'Paste a Google Maps, Google Share, Google Flights, or Google Hotels link first.';
			return;
		}

		creatorState = 'importing';
		errorMessage = '';
		try {
			const response = await fetch(endpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: value })
			});
			const data = await responseData(response);
			const imported = itineraryItemImportResponseSchema.safeParse(data);
			if (!response.ok || !imported.success) {
				creatorState = 'entry';
				errorMessage = errorFrom(data, 'The link could not be imported.');
				return;
			}
			brandIconFeedback.publish('success');
			const [onlyImportedItem] = imported.data.items;
			if (imported.data.items.length === 1 && onlyImportedItem?.type === 'accommodation') {
				startAccommodationStay(onlyImportedItem);
				return;
			}
			importedItems = imported.data.items;
			creatorState = 'review';
		} catch {
			creatorState = 'entry';
			errorMessage = 'The link could not be imported because the server is unavailable.';
		}
	}

	function startManual(type: ItineraryItemType): void {
		if (type === 'transport') {
			startTransportJourney();
			return;
		}
		if (type === 'accommodation') {
			startAccommodationStay();
			return;
		}
		requireDialogElement().close();
		onManual(type);
	}

	function selectImportedItem(item: ItineraryItemImport): void {
		if (item.type === 'transport') {
			startTransportJourney(item);
			return;
		}
		if (item.type === 'accommodation') {
			startAccommodationStay(item);
			return;
		}
		requireDialogElement().close();
		onImported(item);
	}

	function retryImport(): void {
		creatorState = 'entry';
		errorMessage = '';
		importedItems = [];
	}

	function importedItemDescription(item: ItineraryItemImport): string {
		if (item.type === 'accommodation') {
			const destination = item.locations[0]?.name ?? item.title;
			return item.suggestedStartDate && item.suggestedEndDate
				? `${destination} · ${item.suggestedStartDate} to ${item.suggestedEndDate}`
				: `Accommodation in ${destination}`;
		}
		if (item.type === 'activity') {
			return 'Activity details were detected';
		}
		const route = item.locations.map((location) => location.name).join(' to ');
		const service = item.transport.operator
			? `${item.transport.operator}${item.transport.serviceNumber ? ` ${item.transport.serviceNumber}` : ''} · `
			: item.transport.serviceNumber
				? `${item.transport.serviceNumber} · `
				: '';
		return `${service}${route}`;
	}

	function emptyTransportEndpoint(): TransportEndpointDraft {
		return { googleMapsUrl: '', name: '', openRailwayMapUrl: '' };
	}

	function optionalText(value: string): string | undefined {
		const trimmed = value.trim();
		return trimmed === '' ? undefined : trimmed;
	}

	function emptyAccommodationLocation(): AccommodationLocationDraft {
		return { address: '', googleMapsUrl: '', name: '' };
	}

	function startAccommodationStay(item?: Extract<ItineraryItemImport, { readonly type: 'accommodation' }>): void {
		const location = item?.locations[0];
		accommodationErrorMessage = '';
		accommodationItemId = crypto.randomUUID();
		accommodationLocationId = crypto.randomUUID();
		accommodationLocation = location
			? {
					address: location.address ?? '',
					googleMapsUrl: location.googleMapsUrl ?? '',
					name: location.name,
					...(location.coordinates ? { coordinates: location.coordinates } : {})
				}
			: { ...emptyAccommodationLocation(), name: item?.title ?? '' };
		accommodationCheckInDate = item?.suggestedStartDate ?? initialDate ?? '';
		accommodationCheckInTime = item?.suggestedCheckInTime ?? '';
		accommodationCheckOutDate =
			item?.suggestedEndDate ??
			(accommodationDateIsValid(accommodationCheckInDate) ? (addCalendarDays(accommodationCheckInDate, 1) ?? '') : '');
		accommodationCheckOutTime = item?.suggestedCheckOutTime ?? '';
		accommodationPropertyStatus = item?.propertyStatus ?? null;
		accommodationSourceLinks = item ? [...item.links] : [];
		accommodationTimeZone = item?.suggestedTimeZone ?? tripTimeZone;
		accommodationTimesKnown = item?.suggestedCheckInTime !== undefined && item.suggestedCheckOutTime !== undefined;
		accommodationReservationEnabled = false;
		accommodationReservationProvider = '';
		accommodationReservationReference = '';
		accommodationReservationStatus = 'confirmed';
		accommodationCostEnabled = false;
		accommodationCostAmount = '';
		accommodationCostCurrency = localCurrency;
		accommodationCostPaid = false;
		accommodationCostScheduledPaymentDate = '';
		creatorState = 'accommodation-details';
	}

	function accommodationDateIsValid(value: string): boolean {
		return formatCalendarDate(value) !== null;
	}

	function accommodationDateTime(date: string, time: string): string {
		return `${date}T${time}`;
	}

	function setAccommodationDateRange(range: Readonly<{ checkInDate: string; checkOutDate: string }>): void {
		accommodationCheckInDate = range.checkInDate;
		accommodationCheckOutDate = range.checkOutDate;
	}

	function setAccommodationCheckInDateTime(value: string): void {
		accommodationCheckInDate = value.slice(0, 10);
		if (accommodationTimesKnown) {
			accommodationCheckInTime = value.slice(11);
		}
	}

	function setAccommodationCheckOutDateTime(value: string): void {
		accommodationCheckOutDate = value.slice(0, 10);
		if (accommodationTimesKnown) {
			accommodationCheckOutTime = value.slice(11);
		}
	}

	function hasGoogleHotelsSource(): boolean {
		return accommodationSourceLinks.some((link) => link.label === 'Google Hotels');
	}

	function accommodationStayCandidate(): AccommodationStayValidation {
		return accommodationStayDraft({
			id: accommodationItemId,
			locationId: accommodationLocationId,
			title: accommodationLocation.name,
			name: accommodationLocation.name,
			address: accommodationLocation.address,
			googleMapsUrl: accommodationLocation.googleMapsUrl,
			...(accommodationLocation.coordinates ? { coordinates: accommodationLocation.coordinates } : {}),
			checkInDate: accommodationCheckInDate,
			...(accommodationTimesKnown ? { checkInTime: accommodationCheckInTime } : {}),
			checkOutDate: accommodationCheckOutDate,
			...(accommodationTimesKnown ? { checkOutTime: accommodationCheckOutTime } : {}),
			links: accommodationSourceLinks,
			timesKnown: accommodationTimesKnown,
			timeZone: accommodationTimeZone,
			...(accommodationReservationEnabled
				? {
						reservation: {
							provider: accommodationReservationProvider,
							reference: accommodationReservationReference,
							status: accommodationReservationStatus
						}
					}
				: {}),
			...(accommodationCostEnabled
				? {
						cost: {
							amount: accommodationCostAmount,
							currency: accommodationCostCurrency,
							...(accommodationCostScheduledPaymentDate
								? { scheduledPaymentDate: accommodationCostScheduledPaymentDate }
								: {}),
							status: accommodationCostPaid ? 'paid' : 'unpaid'
						}
					}
				: {})
		});
	}

	function accommodationStatusMessage(): string | null {
		switch (accommodationPropertyStatus) {
			case 'confirmed':
				return 'Property details were confirmed from the selected Google link';
			case 'area-only':
				return 'Google Hotels confirmed the stay dates, but this link names an area rather than a property. Paste the hotel’s Maps link to replace it';
			case 'unconfirmed':
				return 'Google identified a likely property, but it could not be independently confirmed. Check the name or paste its Maps link';
			case null:
				return null;
		}
	}

	function returnToItemType(): void {
		accommodationErrorMessage = '';
		creatorState = 'entry';
	}

	async function resolveAccommodationLocation(): Promise<void> {
		const url = accommodationLocation.googleMapsUrl.trim();
		if (url === '') {
			accommodationErrorMessage =
				'Paste a Google Maps, Google Share, or Google Hotels property link to look up the property.';
			return;
		}

		resolvingAccommodationLocation = true;
		accommodationErrorMessage = '';
		try {
			const response = await fetch(locationResolveEndpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			const data = await responseData(response);
			const importedLocation = locationResolveResponseSchema.safeParse(data);
			if (!response.ok || !importedLocation.success || !importedLocation.data.googleMapsUrl) {
				accommodationErrorMessage = errorFrom(data, 'The property location could not be imported.');
				return;
			}
			accommodationLocation.googleMapsUrl = importedLocation.data.googleMapsUrl;
			accommodationLocation.name = importedLocation.data.name ?? accommodationLocation.name;
			accommodationLocation.address = importedLocation.data.address ?? accommodationLocation.address;
			accommodationLocation.coordinates = importedLocation.data.coordinates;
			accommodationCheckInTime = importedLocation.data.checkInTime ?? accommodationCheckInTime;
			accommodationCheckOutTime = importedLocation.data.checkOutTime ?? accommodationCheckOutTime;
			accommodationTimeZone = importedLocation.data.timeZone ?? accommodationTimeZone;
			accommodationPropertyStatus = 'confirmed';
			if (
				importedLocation.data.googleHotelsUrl &&
				!accommodationSourceLinks.some((link) => link.url === importedLocation.data.googleHotelsUrl)
			) {
				accommodationSourceLinks = [
					...accommodationSourceLinks,
					{ label: 'Google Hotels', url: importedLocation.data.googleHotelsUrl }
				];
			}
		} catch {
			accommodationErrorMessage = 'The property location could not be imported because the server is unavailable.';
		} finally {
			resolvingAccommodationLocation = false;
		}
	}

	function accommodationNightCount(): number | null {
		if (!accommodationDateIsValid(accommodationCheckInDate) || !accommodationDateIsValid(accommodationCheckOutDate)) {
			return null;
		}
		return Math.round(
			(Date.parse(`${accommodationCheckOutDate}T00:00:00Z`) - Date.parse(`${accommodationCheckInDate}T00:00:00Z`)) /
				86_400_000
		);
	}

	async function releaseAccommodationLock(lockToken: string): Promise<boolean> {
		try {
			const response = await fetch(`${tripEndpoint()}/edit`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lockToken })
			});
			return response.ok || response.status === 423;
		} catch {
			return false;
		}
	}

	async function saveAccommodationStay(): Promise<void> {
		const candidate = accommodationStayCandidate();
		if (!candidate.valid) {
			accommodationErrorMessage = candidate.error;
			return;
		}

		savingAccommodation = true;
		accommodationErrorMessage = '';
		let lockToken: string | null = null;
		let saved = false;
		try {
			const lockResponse = await fetch(`${tripEndpoint()}/edit`, { method: 'POST' });
			const lockData = await responseData(lockResponse);
			const lock = editLockResponseSchema.safeParse(lockData);
			if (!lockResponse.ok || !lock.success) {
				accommodationErrorMessage = errorFrom(lockData, 'The edit lock could not be acquired.');
				return;
			}
			lockToken = lock.data.token;

			const response = await fetch(itemEndpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ item: candidate.item, lockToken, revision })
			});
			const data = await responseData(response);
			if (!response.ok || !editSaveResponseSchema.safeParse(data).success) {
				accommodationErrorMessage = errorFrom(data, 'The accommodation could not be saved.');
				return;
			}
			saved = true;
			brandIconFeedback.publish('success');
			await onAccommodationSaved();
		} catch {
			accommodationErrorMessage = 'The accommodation could not be saved because the server is unavailable.';
		} finally {
			if (lockToken && !saved && !(await releaseAccommodationLock(lockToken))) {
				accommodationErrorMessage = `${accommodationErrorMessage} The edit lock could not be released; it will expire automatically.`;
			}
			savingAccommodation = false;
		}
	}

	function assignEndpoint(endpoint: TransportEndpointDraft, value: TransportJourneyDraft['departure']): void {
		endpoint.code = value.code;
		endpoint.name = value.name;
		endpoint.googleMapsUrl = value.googleMapsUrl ?? '';
		endpoint.openRailwayMapUrl = value.openRailwayMapUrl ?? '';
		endpoint.coordinates = value.coordinates;
	}

	function startTransportJourney(item?: Extract<ItineraryItemImport, { readonly type: 'transport' }>): void {
		transportErrorMessage = '';
		if (item) {
			const journey = transportJourneyDraftFromImport(item);
			assignEndpoint(departure, journey.departure);
			assignEndpoint(arrival, journey.arrival);
			transportMode = journey.mode;
			transportOperator = journey.operator ?? '';
			transportServiceNumber = journey.serviceNumber ?? '';
			transportTitle = journey.title ?? '';
			suggestedStartDate = journey.suggestedStartDate ?? '';
			transportSourceLinks = journey.sourceLinks;
			transportSchedule = journey.schedule;
			airportCandidateResolutions = airportCandidateResolutionsForImport(item);
		} else {
			departure = emptyTransportEndpoint();
			arrival = emptyTransportEndpoint();
			transportMode = 'other';
			transportOperator = '';
			transportServiceNumber = '';
			transportTitle = '';
			suggestedStartDate = '';
			transportSourceLinks = [];
			transportSchedule = undefined;
			airportCandidateResolutions = {};
		}
		creatorState = item && transportSchedule ? 'transport-review' : 'transport-departure';
	}

	function endpointFor(kind: TransportEndpointKind): TransportEndpointDraft {
		return kind === 'departure' ? departure : arrival;
	}

	function endpointLabel(kind: TransportEndpointKind): string {
		return kind === 'departure' ? 'departure' : 'arrival';
	}

	function airportCandidateResolutionsForImport(
		item: ImportedTransportItem
	): Partial<Record<TransportEndpointKind, AirportCandidateResolution>> {
		const resolutions: Partial<Record<TransportEndpointKind, AirportCandidateResolution>> = {};
		for (const kind of ['departure', 'arrival'] as const) {
			const location = item.locations.find((candidate) => candidate.role === kind);
			if (location?.code && location.airportCandidates) {
				resolutions[kind] = { candidates: [...location.airportCandidates], code: location.code, selectedIndex: null };
			}
		}
		return resolutions;
	}

	function airportCandidateResolution(kind: TransportEndpointKind): AirportCandidateResolution | undefined {
		return airportCandidateResolutions[kind];
	}

	function selectAirportCandidate(kind: TransportEndpointKind, selectedIndex: number): void {
		const resolution = airportCandidateResolution(kind);
		const candidate = resolution?.candidates[selectedIndex];
		if (!resolution || !candidate) {
			return;
		}
		const endpointDraft = endpointFor(kind);
		const previousRouteTitle = transportRouteTitle(departure.name, arrival.name);
		endpointDraft.name = candidate.name;
		endpointDraft.googleMapsUrl = candidate.googleMapsUrl ?? '';
		endpointDraft.coordinates = candidate.coordinates;
		if (transportTitle === previousRouteTitle) {
			transportTitle = transportRouteTitle(departure.name, arrival.name);
		}
		airportCandidateResolutions = {
			...airportCandidateResolutions,
			[kind]: { ...resolution, selectedIndex }
		};
		transportErrorMessage = '';
	}

	function useDifferentAirportLocation(kind: TransportEndpointKind): void {
		const resolution = airportCandidateResolution(kind);
		if (!resolution) {
			return;
		}
		const endpointDraft = endpointFor(kind);
		endpointDraft.name = endpointDraft.code ?? '';
		endpointDraft.coordinates = undefined;
		endpointDraft.googleMapsUrl = '';
		const updatedResolutions = { ...airportCandidateResolutions };
		delete updatedResolutions[kind];
		airportCandidateResolutions = updatedResolutions;
		transportErrorMessage = '';
	}

	function endpointValue(endpointDraft: TransportEndpointDraft): TransportJourneyDraft['departure'] {
		const code = optionalText(endpointDraft.code ?? '');
		const googleMapsUrl = optionalText(endpointDraft.googleMapsUrl);
		const openRailwayMapUrl = optionalText(endpointDraft.openRailwayMapUrl);
		return {
			name: endpointDraft.name.trim(),
			...(code ? { code } : {}),
			...(googleMapsUrl ? { googleMapsUrl } : {}),
			...(openRailwayMapUrl ? { openRailwayMapUrl } : {}),
			...(endpointDraft.coordinates ? { coordinates: endpointDraft.coordinates } : {})
		};
	}

	function transportJourneyCandidate(): TransportJourneyDraft {
		return {
			departure: endpointValue(departure),
			arrival: endpointValue(arrival),
			mode: transportMode,
			sourceLinks: transportSourceLinks,
			...(transportSchedule ? { schedule: transportSchedule } : {}),
			...(optionalText(transportOperator) ? { operator: optionalText(transportOperator) } : {}),
			...(optionalText(transportServiceNumber) ? { serviceNumber: optionalText(transportServiceNumber) } : {}),
			...(optionalText(transportTitle) ? { title: optionalText(transportTitle) } : {}),
			...(optionalText(suggestedStartDate) ? { suggestedStartDate: optionalText(suggestedStartDate) } : {})
		};
	}

	function moveToTransportEndpoint(event: SubmitEvent, kind: TransportEndpointKind): void {
		event.preventDefault();
		const endpointDraft = endpointFor(kind);
		if (airportCandidateResolution(kind)?.selectedIndex === null) {
			transportErrorMessage = `Choose the ${endpointLabel(kind)} airport or enter a different location.`;
			return;
		}
		if (endpointDraft.name.trim() === '') {
			transportErrorMessage = `Enter the ${endpointLabel(kind)} place, airport, station, or address.`;
			return;
		}
		transportErrorMessage = '';
		creatorState = kind === 'departure' ? 'transport-arrival' : 'transport-details';
	}

	function moveToTransportReview(event: SubmitEvent): void {
		event.preventDefault();
		const journey = transportJourneyDraftSchema.safeParse(transportJourneyCandidate());
		if (!journey.success) {
			transportErrorMessage = 'Check the journey details before continuing.';
			return;
		}
		transportErrorMessage = '';
		creatorState = 'transport-review';
	}

	function goBackFromTransportStep(): void {
		transportErrorMessage = '';
		switch (creatorState) {
			case 'transport-arrival':
				creatorState = 'transport-departure';
				break;
			case 'transport-details':
				creatorState = 'transport-arrival';
				break;
			case 'transport-review':
				creatorState = 'transport-details';
				break;
			default:
				creatorState = 'entry';
		}
	}

	function completeTransportJourney(): void {
		const journey = transportJourneyDraftSchema.safeParse(transportJourneyCandidate());
		if (!journey.success) {
			transportErrorMessage = 'Check the journey details before continuing.';
			creatorState = 'transport-details';
			return;
		}
		requireDialogElement().close();
		onTransportJourney(journey.data);
	}

	function mapUrlForProvider(endpointDraft: TransportEndpointDraft, provider: TransportEndpointMapProvider): string {
		return provider === 'google-maps' ? endpointDraft.googleMapsUrl : endpointDraft.openRailwayMapUrl;
	}

	function isResolvingEndpoint(kind: TransportEndpointKind, provider: TransportEndpointMapProvider): boolean {
		return resolvingEndpoint?.kind === kind && resolvingEndpoint.provider === provider;
	}

	function mapProviderLabel(provider: TransportEndpointMapProvider): string {
		return provider === 'google-maps' ? 'Google Maps or Google Share' : 'OpenRailwayMap';
	}

	async function resolveTransportEndpoint(
		kind: TransportEndpointKind,
		provider: TransportEndpointMapProvider
	): Promise<void> {
		const endpointDraft = endpointFor(kind);
		const providerName = mapProviderLabel(provider);
		const url = mapUrlForProvider(endpointDraft, provider).trim();
		if (url === '') {
			transportErrorMessage = `Paste a ${providerName} link to look up the ${endpointLabel(kind)}.`;
			return;
		}

		resolvingEndpoint = { kind, provider };
		transportErrorMessage = '';
		try {
			const response = await fetch(locationResolveEndpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			const data = await responseData(response);
			const importedLocation = locationResolveResponseSchema.safeParse(data);
			if (!response.ok || !importedLocation.success) {
				transportErrorMessage = errorFrom(data, `The ${endpointLabel(kind)} could not be imported.`);
				return;
			}

			if (provider === 'google-maps') {
				if (!importedLocation.data.googleMapsUrl) {
					transportErrorMessage = `The ${providerName} link could not be imported.`;
					return;
				}
				endpointDraft.googleMapsUrl = importedLocation.data.googleMapsUrl;
			} else {
				if (!importedLocation.data.openRailwayMapUrl) {
					transportErrorMessage = `The ${providerName} link could not be imported.`;
					return;
				}
				endpointDraft.openRailwayMapUrl = importedLocation.data.openRailwayMapUrl;
			}
			endpointDraft.name = importedLocation.data.name ?? endpointDraft.name;
			endpointDraft.coordinates = importedLocation.data.coordinates;
		} catch {
			transportErrorMessage = `The ${endpointLabel(kind)} could not be imported because the server is unavailable.`;
		} finally {
			resolvingEndpoint = null;
		}
	}

	function journeyPreview(): string {
		const candidate = transportJourneyDraftSchema.safeParse(transportJourneyCandidate());
		return candidate.success ? transportJourneyTitle(candidate.data) : 'Your transport journey';
	}

	function scheduleTimeLabel(point: TransportJourneySchedule['departure']): string {
		const dateTime = formatTimestampForTimeZoneInput(point.scheduledAt, point.timeZone);
		if (!dateTime) {
			return 'Unavailable';
		}
		const [date, time] = dateTime.split('T', 2);
		return date && time
			? formatCalendarDateTime(
					date,
					time,
					'date',
					viewerContext.locale,
					viewerContext.formatPreferences.dateFormat,
					viewerContext.formatPreferences.timeFormat
				)
			: 'Unavailable';
	}

	onMount(() => {
		accommodationTimeZoneOptions = browserTimeZoneOptions();
		requireDialogElement().showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="item-creator-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	onclose={onDismiss}
>
	<div
		class="creator"
		data-brand-feedback={creatorState === 'importing' || savingAccommodation ? 'loading' : undefined}
		data-dialog-scroll-area
	>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">New itinerary item</p>
				<h2 id="item-creator-heading">
					{creatorState === 'review'
						? 'Review imported items'
						: creatorState.startsWith('transport-')
							? 'Add transport'
							: creatorState.startsWith('accommodation-')
								? 'Add accommodation'
								: 'Add an item'}
				</h2>
			</div>
			<form method="dialog"><button type="submit">Close</button></form>
		</header>

		{#if creatorState === 'review'}
			<p class="intro">Choose an item to review and complete before saving</p>
			<ul>
				{#each importedItems as item, index (index)}
					<li>
						<div>
							<strong>{item.title}</strong>
							<span>{importedItemDescription(item)}</span>
							{#if item.type === 'accommodation' && item.suggestedStartDate && item.suggestedEndDate}
								<small
									>Stay dates: {item.suggestedStartDate} to {item.suggestedEndDate}; review check-in and check-out</small
								>
							{:else if item.suggestedStartDate}
								<small>Suggested date: {item.suggestedStartDate}; confirm the time</small>
							{:else}
								<small>Confirm the schedule before saving</small>
							{/if}
						</div>
						<button onclick={() => selectImportedItem(item)} type="button">Review</button>
					</li>
				{/each}
			</ul>
			<button class="text-button" onclick={retryImport} type="button">Try another link</button>
		{:else if creatorState === 'transport-departure' || creatorState === 'transport-arrival'}
			{@const endpointKind: TransportEndpointKind = creatorState === 'transport-departure' ? 'departure' : 'arrival'}
			{@const endpointDraft = endpointFor(endpointKind)}
			{@const candidateResolution = airportCandidateResolution(endpointKind)}
			<p class="wizard-progress">
				Step {endpointKind === 'departure' ? '1' : '2'} of 4 · {endpointLabel(endpointKind)}
			</p>
			<p class="intro">
				Where does this journey {endpointKind === 'departure' ? 'start' : 'end'}? A place, airport, station, stop, or
				address is enough
			</p>
			<form class="shiori-form" onsubmit={(event) => moveToTransportEndpoint(event, endpointKind)}>
				{#if candidateResolution}
					<fieldset class="airport-candidate-picker">
						<legend>Choose the airport for {candidateResolution.code}</legend>
						<p>Google found more than one airport match. Select the one used by this journey</p>
						<div class="airport-candidate-options">
							{#each candidateResolution.candidates as candidate, index (index)}
								<label class="airport-candidate-choice">
									<input
										checked={candidateResolution.selectedIndex === index}
										name={`airport-candidate-${endpointKind}`}
										onchange={() => selectAirportCandidate(endpointKind, index)}
										type="radio"
									/>
									<span>
										<strong>{candidate.name}</strong>
										{#if candidate.address}<small>{candidate.address}</small>{/if}
									</span>
								</label>
							{/each}
						</div>
						<button class="text-button" onclick={() => useDifferentAirportLocation(endpointKind)} type="button">
							Use a different place
						</button>
					</fieldset>
				{/if}
				<label class="shiori-form-label">
					{endpointKind === 'departure' ? 'Departure' : 'Arrival'}
					<input
						class="shiori-form-control"
						bind:value={endpointDraft.name}
						placeholder="Airport, station, place, or address"
						required
					/>
				</label>
				<div class="maps-lookup">
					<label class="shiori-form-label">
						Google Maps or Google Share link <span class="field-hint">Optional; we’ll fill in what we can</span>
						<input
							class="shiori-form-control"
							bind:value={endpointDraft.googleMapsUrl}
							inputmode="url"
							placeholder="Paste a Google Maps or Google Share link"
						/>
					</label>
					<button
						class="shiori-form-button"
						disabled={resolvingEndpoint !== null}
						onclick={() => void resolveTransportEndpoint(endpointKind, 'google-maps')}
						type="button"
					>
						{isResolvingEndpoint(endpointKind, 'google-maps') ? 'Looking up…' : 'Look up link'}
					</button>
				</div>
				<div class="maps-lookup">
					<label class="shiori-form-label">
						OpenRailwayMap link <span class="field-hint">Optional; import its station name or map position</span>
						<input
							class="shiori-form-control"
							bind:value={endpointDraft.openRailwayMapUrl}
							inputmode="url"
							placeholder="Paste an OpenRailwayMap permalink"
						/>
					</label>
					<button
						class="shiori-form-button"
						disabled={resolvingEndpoint !== null}
						onclick={() => void resolveTransportEndpoint(endpointKind, 'open-railway-map')}
						type="button"
					>
						{isResolvingEndpoint(endpointKind, 'open-railway-map') ? 'Looking up…' : 'Look up link'}
					</button>
				</div>
				{#if transportErrorMessage}<p class="error" role="alert">{transportErrorMessage}</p>{/if}
				<div class="wizard-actions">
					<button class="text-button" onclick={goBackFromTransportStep} type="button">
						{endpointKind === 'departure' ? 'Back to item type' : 'Back'}
					</button>
					<button class="shiori-form-button" type="submit">Continue</button>
				</div>
			</form>
		{:else if creatorState === 'transport-details'}
			<p class="wizard-progress">Step 3 of 4 · Journey details</p>
			<p class="intro">Add only the details that help identify this trip. You’ll set its precise schedule next</p>
			<form class="shiori-form" onsubmit={moveToTransportReview}>
				<label class="shiori-form-label">
					Transport mode
					<select class="shiori-form-control" bind:value={transportMode}>
						{#each transportModeOptions as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
				<div class="field-grid">
					<label class="shiori-form-label">
						Operator <span class="field-hint">Optional</span>
						<input class="shiori-form-control" bind:value={transportOperator} placeholder="Airline or operator" />
					</label>
					<label class="shiori-form-label">
						Service number <span class="field-hint">Optional</span>
						<input class="shiori-form-control" bind:value={transportServiceNumber} placeholder="e.g. JQ35" />
					</label>
				</div>
				{#if transportSchedule}
					<p class="schedule-found">The imported scheduled times will be kept for the final review</p>
				{:else}
					<DateTimeInput
						dateTime={`${suggestedStartDate}T`}
						id="transport-departure-date"
						label="Departure date"
						onDateTimeChange={(value) => (suggestedStartDate = value.slice(0, 10))}
						portalTarget={dialogElement}
						pickerMode="date"
						showTimeZonePicker={false}
					/>
					<p class="field-hint">Optional; used to prefill the schedule</p>
				{/if}
				<label class="shiori-form-label">
					Journey title <span class="field-hint">Optional; a route title is generated otherwise</span>
					<input class="shiori-form-control" bind:value={transportTitle} placeholder="Travel: Melbourne to Tokyo" />
				</label>
				{#if transportErrorMessage}<p class="error" role="alert">{transportErrorMessage}</p>{/if}
				<div class="wizard-actions">
					<button class="text-button" onclick={goBackFromTransportStep} type="button">Back</button>
					<button class="shiori-form-button" type="submit">Review journey</button>
				</div>
			</form>
		{:else if creatorState === 'transport-review'}
			<p class="wizard-progress">Step 4 of 4 · Review</p>
			<p class="intro">
				{transportSchedule
					? 'The imported source found a scheduled journey. Confirm it before saving'
					: 'Confirm the journey. The next screen will ask for the departure time before you save it'}
			</p>
			<section class="journey-summary" aria-label="Transport journey summary">
				<strong>{journeyPreview()}</strong>
				<p>{departure.name} <Icon class="journey-direction" name="forward" size="1rem" /> {arrival.name}</p>
				<dl>
					<div>
						<dt>Mode</dt>
						<dd>{transportMode}</dd>
					</div>
					{#if optionalText(transportOperator)}<div>
							<dt>Operator</dt>
							<dd>{optionalText(transportOperator)}</dd>
						</div>{/if}
					{#if optionalText(transportServiceNumber)}<div>
							<dt>Service</dt>
							<dd>{optionalText(transportServiceNumber)}</dd>
						</div>{/if}
					{#if transportSchedule}
						<div>
							<dt>Departs</dt>
							<dd>{scheduleTimeLabel(transportSchedule.departure)} · {transportSchedule.departure.timeZone}</dd>
						</div>
						<div>
							<dt>Arrives</dt>
							<dd>{scheduleTimeLabel(transportSchedule.arrival)} · {transportSchedule.arrival.timeZone}</dd>
						</div>
					{/if}
					{#if optionalText(suggestedStartDate)}<div>
							<dt>Departure date</dt>
							<dd>{suggestedStartDate}</dd>
						</div>{/if}
				</dl>
			</section>
			{#if transportErrorMessage}<p class="error" role="alert">{transportErrorMessage}</p>{/if}
			<div class="wizard-actions">
				<button class="text-button" onclick={goBackFromTransportStep} type="button">Back</button>
				<button class="shiori-form-button" onclick={completeTransportJourney} type="button">
					{transportSchedule ? 'Continue to final review' : 'Continue to schedule'}
				</button>
			</div>
		{:else if creatorState === 'accommodation-details'}
			{@const stayNights = accommodationNightCount()}
			<p class="wizard-progress">Accommodation review</p>
			<p class="intro">Check the stay details, fill only what is missing, then save</p>
			<form
				class="shiori-form"
				onsubmit={(event) => {
					event.preventDefault();
					void saveAccommodationStay();
				}}
			>
				{#if accommodationStatusMessage()}
					<p class="schedule-found">{accommodationStatusMessage()}</p>
				{/if}
				<label class="shiori-form-label">
					Property
					<input
						class="shiori-form-control"
						bind:value={accommodationLocation.name}
						placeholder="Hotel, hostel, apartment, or campsite"
						required
					/>
				</label>
				<label class="shiori-form-label">
					Address <span class="field-hint">Optional</span>
					<input class="shiori-form-control" bind:value={accommodationLocation.address} placeholder="Street address" />
				</label>
				<div class="maps-lookup">
					<label class="shiori-form-label">
						Google Maps, Google Share, or Google Hotels property link <span class="field-hint"
							>Optional; we’ll fill in the property details we can</span
						>
						<input
							class="shiori-form-control"
							bind:value={accommodationLocation.googleMapsUrl}
							inputmode="url"
							placeholder="Paste a Google Maps, Google Share, or Google Hotels property link"
						/>
					</label>
					<button
						class="shiori-form-button"
						disabled={resolvingAccommodationLocation}
						onclick={() => void resolveAccommodationLocation()}
						type="button"
					>
						{resolvingAccommodationLocation ? 'Looking up…' : 'Look up link'}
					</button>
				</div>
				<DateRangeInput
					checkInDate={accommodationCheckInDate}
					checkOutDate={accommodationCheckOutDate}
					id="accommodation-stay-dates"
					onDateRangeChange={setAccommodationDateRange}
					portalTarget={dialogElement}
				/>
				<div class="shiori-form-label">
					<label for="accommodation-time-zone">Property time zone</label>
					<TimeZonePicker
						id="accommodation-time-zone"
						label="Property time zone"
						onSelect={(timeZone) => (accommodationTimeZone = timeZone)}
						options={accommodationTimeZoneOptions}
						value={accommodationTimeZone}
					/>
				</div>
				<label class="toggle-label">
					<input bind:checked={accommodationTimesKnown} type="checkbox" />
					I know the check-in and check-out times
				</label>
				{#if accommodationTimesKnown}
					<div class="field-grid">
						<DateTimeInput
							dateTime={accommodationDateTime(accommodationCheckInDate, accommodationCheckInTime)}
							id="accommodation-check-in-time"
							label="Check-in time"
							onDateTimeChange={setAccommodationCheckInDateTime}
							portalTarget={dialogElement}
							pickerMode="time"
							showTimeZonePicker={false}
							timeZone={accommodationTimeZone}
						/>
						<DateTimeInput
							dateTime={accommodationDateTime(accommodationCheckOutDate, accommodationCheckOutTime)}
							id="accommodation-check-out-time"
							label="Check-out time"
							onDateTimeChange={setAccommodationCheckOutDateTime}
							portalTarget={dialogElement}
							pickerMode="time"
							showTimeZonePicker={false}
							timeZone={accommodationTimeZone}
						/>
					</div>
					{#if hasGoogleHotelsSource() && (accommodationCheckInTime || accommodationCheckOutTime)}
						<p class="schedule-found">Google Hotels supplied usual stay times. Confirm them against your booking</p>
					{/if}
				{:else}
					<p class="field-hint">
						Times stay unknown; the itinerary will show the stay dates without inventing an exact time
					</p>
				{/if}
				<details class="optional-details">
					<summary>Booking and cost <span class="field-hint">Optional</span></summary>
					<div class="optional-details-content">
						<label class="toggle-label">
							<input bind:checked={accommodationReservationEnabled} type="checkbox" />
							Add booking reference
						</label>
						{#if accommodationReservationEnabled}
							<div class="field-grid">
								<label class="shiori-form-label">
									Provider <span class="field-hint">Optional</span>
									<input
										class="shiori-form-control"
										bind:value={accommodationReservationProvider}
										placeholder="Booking.com"
									/>
								</label>
								<label class="shiori-form-label">
									Reference <span class="field-hint">Optional</span>
									<input
										class="shiori-form-control"
										bind:value={accommodationReservationReference}
										placeholder="Confirmation number"
									/>
								</label>
							</div>
							<label class="shiori-form-label">
								Booking status
								<select class="shiori-form-control" bind:value={accommodationReservationStatus}>
									{#each accommodationReservationStatusOptions as status (status)}
										<option value={status}>{status}</option>
									{/each}
								</select>
							</label>
						{/if}
						<label class="toggle-label">
							<input bind:checked={accommodationCostEnabled} type="checkbox" />
							Add cost
						</label>
						{#if accommodationCostEnabled}
							<div class="field-grid">
								<label class="shiori-form-label">
									Amount
									<input
										class="shiori-form-control"
										bind:value={accommodationCostAmount}
										inputmode="decimal"
										placeholder="0.00"
										required
									/>
								</label>
								<label class="shiori-form-label">
									Currency
									<select class="shiori-form-control" bind:value={accommodationCostCurrency}>
										{#each currencyOptions as currency (currency)}
											<option value={currency}>{currency}</option>
										{/each}
									</select>
								</label>
							</div>
							<div class="field-grid">
								<label class="toggle-label">
									<input bind:checked={accommodationCostPaid} type="checkbox" />
									Already paid
								</label>
								<DateTimeInput
									dateTime={`${accommodationCostScheduledPaymentDate}T`}
									id="accommodation-cost-scheduled-payment-date"
									label="Scheduled payment date"
									onDateTimeChange={(value) => (accommodationCostScheduledPaymentDate = value.slice(0, 10))}
									portalTarget={dialogElement}
									pickerMode="date"
									showTimeZonePicker={false}
								/>
							</div>
						{/if}
					</div>
				</details>
				<section class="journey-summary" aria-label="Accommodation summary">
					<strong>{accommodationLocation.name || 'Accommodation'}</strong>
					{#if optionalText(accommodationLocation.address)}<p>{optionalText(accommodationLocation.address)}</p>{/if}
					<dl>
						<div>
							<dt>Stay</dt>
							<dd>
								{formatCalendarDate(
									accommodationCheckInDate,
									'date',
									viewerContext.locale,
									viewerContext.formatPreferences.dateFormat
								) ?? accommodationCheckInDate} to
								{formatCalendarDate(
									accommodationCheckOutDate,
									'date',
									viewerContext.locale,
									viewerContext.formatPreferences.dateFormat
								) ?? accommodationCheckOutDate}
							</dd>
						</div>
						{#if stayNights !== null}<div>
								<dt>Nights</dt>
								<dd>{stayNights}</dd>
							</div>{/if}
						<div>
							<dt>Times</dt>
							<dd>
								{accommodationTimesKnown
									? `${formatTime(accommodationCheckInTime, viewerContext.formatPreferences.timeFormat)} to ${formatTime(accommodationCheckOutTime, viewerContext.formatPreferences.timeFormat)}`
									: 'Unknown'}
							</dd>
						</div>
					</dl>
				</section>
				{#if accommodationErrorMessage}<p class="error" role="alert">{accommodationErrorMessage}</p>{/if}
				<div class="wizard-actions">
					<button class="text-button" onclick={returnToItemType} type="button">Back to item type</button>
					<button class="shiori-form-button" disabled={savingAccommodation} type="submit">
						{savingAccommodation ? 'Saving…' : 'Save accommodation'}
					</button>
				</div>
			</form>
		{:else}
			<p class="intro">
				Paste a Google Maps or Google Share place or directions link, a Google Flights link, or a Google Hotels search
				or property link. We’ll prefill what we can, then you can review it
			</p>
			<form class="shiori-form" onsubmit={importUrl}>
				<label class="shiori-form-label">
					Google link
					<input
						class="shiori-form-control"
						bind:value={url}
						inputmode="url"
						placeholder="Paste a Google Maps, Google Share, Google Flights, or Google Hotels link"
					/>
				</label>
				{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
				<button class="shiori-form-button" disabled={creatorState === 'importing'} type="submit">
					{creatorState === 'importing' ? 'Importing…' : 'Prefill from link'}
				</button>
			</form>

			<div class="manual">
				<h3>Or create manually</h3>
				<div>
					<button disabled={creatorState === 'importing'} onclick={() => startManual('transport')} type="button"
						>Transport</button
					>
					<button disabled={creatorState === 'importing'} onclick={() => startManual('activity')} type="button"
						>Activity</button
					>
					<button disabled={creatorState === 'importing'} onclick={() => startManual('accommodation')} type="button"
						>Accommodation</button
					>
				</div>
			</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-height: calc(100dvh - 2rem);
		max-width: min(38rem, calc(100% - 2rem));
		overflow: visible;
		padding: 0;
		width: 100%;
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 88%, transparent);
	}

	.creator {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		max-height: calc(100dvh - 2rem);
		overflow-x: auto;
		overflow-y: auto;
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	header {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 0 0 0.25rem;
		text-transform: uppercase;
	}

	h2,
	h3,
	p {
		margin-top: 0;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 0;
	}

	.intro {
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin: 1.25rem 0;
	}

	button {
		background: transparent;
		border: 1px solid currentColor;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.375rem 0.625rem;
	}

	button:hover {
		background: var(--color-surface-subtle);
	}

	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.error {
		color: var(--color-state-error);
		margin: 0;
	}

	.manual {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	.manual h3 {
		font-size: 0.875rem;
	}

	.manual > div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.wizard-progress {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 1.25rem 0 0;
		text-transform: uppercase;
	}

	.maps-lookup {
		align-items: end;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.field-grid,
	.wizard-actions {
		display: grid;
		gap: 0.75rem;
	}

	.field-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.wizard-actions {
		align-items: center;
		grid-template-columns: 1fr auto;
		margin-top: 1.25rem;
	}

	.wizard-actions .text-button {
		margin: 0;
		width: fit-content;
	}

	.field-hint {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 400;
	}

	.toggle-label {
		align-items: center;
		display: flex;
		font-weight: 700;
		gap: 0.5rem;
	}

	.toggle-label input {
		accent-color: var(--color-state-selection);
	}

	.journey-summary {
		border: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
	}

	.schedule-found {
		background: var(--color-surface-subtle);
		border-inline-start: 3px solid var(--color-state-selection);
		color: var(--color-text-secondary);
		margin: 0;
		padding: 0.75rem;
	}

	.airport-candidate-picker {
		border: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 1rem;
	}

	.airport-candidate-picker legend {
		font-weight: 700;
		padding: 0 0.25rem;
	}

	.airport-candidate-picker p {
		color: var(--color-text-secondary);
		margin: 0;
	}

	.airport-candidate-options {
		display: grid;
		gap: 0.5rem;
	}

	.airport-candidate-choice {
		align-items: start;
		border: 1px solid var(--color-border-default);
		cursor: pointer;
		display: flex;
		gap: 0.625rem;
		padding: 0.75rem;
	}

	.airport-candidate-choice:has(input:checked) {
		border-color: var(--color-state-selection);
	}

	.airport-candidate-choice span {
		display: grid;
		gap: 0.25rem;
	}

	.airport-candidate-choice small {
		color: var(--color-text-muted);
	}

	.optional-details {
		border: 1px solid var(--color-border-default);
		padding: 0.875rem;
	}

	.optional-details summary {
		cursor: pointer;
		font-weight: 700;
	}

	.optional-details-content {
		display: grid;
		gap: 0.875rem;
		margin-top: 1rem;
	}

	.journey-summary p {
		color: var(--color-text-secondary);
		margin: 0;
	}

	:global(.journey-direction) {
		vertical-align: -0.125em;
	}

	.journey-summary dl {
		display: grid;
		gap: 0.5rem;
		margin: 0;
	}

	.journey-summary dl div {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: 7rem 1fr;
	}

	.journey-summary dt {
		color: var(--color-text-muted);
	}

	.journey-summary dd {
		margin: 0;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		align-items: center;
		border: 1px solid var(--color-border-default);
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		padding: 0.875rem;
	}

	li + li {
		border-top: 0;
	}

	li > div {
		display: grid;
		gap: 0.25rem;
	}

	li span,
	li small {
		color: var(--color-text-muted);
	}

	li small {
		font-size: 0.75rem;
	}

	.text-button {
		border: 0;
		margin-top: 1rem;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}

	@media (max-width: 32rem) {
		li {
			align-items: stretch;
			flex-direction: column;
		}

		.maps-lookup,
		.field-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
