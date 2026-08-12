<script lang="ts">
	import { onMount } from 'svelte';
	import DateTimeInput from '$lib/components/DateTimeInput.svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		apiErrorSchema,
		editLockResponseSchema,
		editSaveResponseSchema,
		locationResolveResponseSchema
	} from '$lib/editing/contracts';
	import {
		currencyCodeSchema,
		documentKindSchema,
		itineraryItemDraftSchema,
		itineraryItemTypeSchema,
		locationRoleSchema,
		reservationStatusSchema,
		timingKindSchema,
		transportModeSchema,
		type DocumentReference,
		type CurrencyCode,
		type ItineraryItem,
		type ItineraryItemDraft,
		type ItineraryItemType,
		type ItineraryLocation,
		type ReservationStatus,
		type ItineraryTiming,
		type CostAmount,
		type TransportDetails
	} from '$lib/itinerary/schema';
	import { amountMinorFromInput, currencyFractionDigits } from '$lib/money';
	import {
		formatTimestampForTimeZoneInput,
		isValidIanaTimeZone,
		zonedDateTimeToUnixMilliseconds
	} from '$lib/itinerary/zoned-time';
	import { browserTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { resolveTimingTimeZone, resolveTransportStopTimeZone } from '$lib/itinerary/time-zone';
	import { operatorNameForServiceNumber } from '$lib/itinerary/transport-operator';
	import { itemTypeAccentStyle } from '$lib/theme/palette';
	import { formatValidationIssues } from '$lib/validation';

	type EditorMode = 'create' | 'edit';
	type EditorState = 'acquiring' | 'editing' | 'error' | 'saving';
	type EditorSectionId =
		| 'editor-cost'
		| 'editor-links'
		| 'editor-overview'
		| 'editor-places'
		| 'editor-private'
		| 'editor-schedule'
		| 'editor-transport';

	type LocationDraft = {
		address: string;
		googleMapsUrl: string;
		id: string;
		isExpanded: boolean;
		latitude: string;
		longitude: string;
		name: string;
		openRailwayMapUrl: string;
		role: ItineraryLocation['role'];
	};

	type LinkDraft = {
		isExpanded: boolean;
		label: string;
		url: string;
	};

	type DocumentDraft = {
		isExpanded: boolean;
		kind: DocumentReference['kind'];
		title: string;
		url: string;
	};

	type StopDraft = {
		inheritsTimingTimeZone: boolean;
		locationId: string;
		platform: string;
		scheduledAt: string;
		timeZone: string;
	};

	type ItemValidation =
		{ readonly item: ItineraryItemDraft; readonly valid: true } | { readonly error: string; readonly valid: false };

	let {
		item,
		mode,
		tripId,
		localCurrency,
		tripTimeZone,
		revision,
		suggestedEndDate,
		suggestedStartDate,
		timingNeedsConfirmation = false,
		onDismiss,
		onSaved
	}: {
		item: ItineraryItem;
		mode: EditorMode;
		tripId: string;
		localCurrency: CurrencyCode;
		tripTimeZone: string;
		revision: number;
		suggestedEndDate?: string;
		suggestedStartDate?: string;
		timingNeedsConfirmation?: boolean;
		onDismiss: () => void;
		onSaved: () => Promise<void>;
	} = $props();

	let dialogElement: HTMLDialogElement;
	let editorElement: HTMLFormElement;
	let editorState = $state<EditorState>('acquiring');
	let errorMessage = $state('');
	let lockToken = $state<string | null>(null);
	let itemType = $state<ItineraryItemType>('activity');
	let title = $state('');
	let timingKind = $state<ItineraryTiming['kind']>('exact');
	let startAt = $state('');
	let endAt = $state('');
	let endAtEnabled = $state(false);
	let exactTimingDateOnly = $state(false);
	let nominalAt = $state('');
	let toleranceMinutes = $state(60);
	let earliestAt = $state('');
	let latestAt = $state('');
	let startAtTimeZone = $state('UTC');
	let notes = $state('');
	let locations = $state<LocationDraft[]>([]);
	let locationImportUrl = $state('');
	let locationImportError = $state('');
	let isImportingLocation = $state(false);
	let links = $state<LinkDraft[]>([]);
	let documents = $state<DocumentDraft[]>([]);
	let reservationEnabled = $state(false);
	let reservationProvider = $state('');
	let reservationReference = $state('');
	let reservationStatus = $state<ReservationStatus>('pending');
	let costEnabled = $state(false);
	let costAmount = $state('');
	let costCurrency = $state<CurrencyCode>('AUD');
	let costPaid = $state(false);
	let transportMode = $state<TransportDetails['mode']>('other');
	let transportOperator = $state('');
	let transportServiceNumber = $state('');
	let transportSeat = $state('');
	let transportStops = $state<StopDraft[]>([]);
	let timeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	let initialDraftFingerprint = $state<string | null>(null);
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	const draftFingerprint = $derived(JSON.stringify(itemCandidate()));
	const hasUnsavedChanges = $derived(initialDraftFingerprint !== null && draftFingerprint !== initialDraftFingerprint);

	const itemTypeOptions = itineraryItemTypeSchema.options;
	const locationRoleOptions = locationRoleSchema.options;
	const reservationStatusOptions = reservationStatusSchema.options;
	const transportModeOptions = transportModeSchema.options;
	const documentKindOptions = documentKindSchema.options;
	const timingKindOptions = timingKindSchema.options;
	const currencyOptions = currencyCodeSchema.options;
	const timingKindLabels: Record<ItineraryTiming['kind'], string> = {
		exact: 'Exact time',
		approximate: 'Around a time',
		window: 'Time window'
	};

	function locationDraft(location: ItineraryLocation): LocationDraft {
		return {
			address: location.address ?? '',
			googleMapsUrl: location.googleMapsUrl ?? '',
			id: location.id,
			isExpanded: false,
			latitude: location.coordinates ? String(location.coordinates.latitude) : '',
			longitude: location.coordinates ? String(location.coordinates.longitude) : '',
			name: location.name,
			openRailwayMapUrl: location.openRailwayMapUrl ?? '',
			role: location.role
		};
	}

	function stopDraft(stop: TransportDetails['stops'][number], timingTimeZone: string): StopDraft {
		const timeZone = resolveTransportStopTimeZone(stop, timingTimeZone);
		return {
			inheritsTimingTimeZone: stop.timeZone === undefined,
			locationId: stop.locationId,
			platform: stop.platform ?? '',
			scheduledAt: stop.scheduledAt ? (formatTimestampForTimeZoneInput(stop.scheduledAt, timeZone) ?? '') : '',
			timeZone
		};
	}

	function populateDraft(source: ItineraryItem, defaultTimeZone: string): void {
		const timeZone = resolveTimingTimeZone(source.timing, defaultTimeZone);
		startAtTimeZone = timeZone;
		itemType = source.type;
		title = source.title;
		timingKind = source.timing.kind;
		startAt = '';
		endAt = '';
		endAtEnabled = false;
		exactTimingDateOnly = false;
		nominalAt = '';
		toleranceMinutes = 60;
		earliestAt = '';
		latestAt = '';
		switch (source.timing.kind) {
			case 'exact':
				startAt = formatTimestampForTimeZoneInput(source.timing.startAt, timeZone) ?? '';
				endAt =
					source.timing.endAt !== undefined
						? (formatTimestampForTimeZoneInput(source.timing.endAt, timeZone) ?? '')
						: '';
				endAtEnabled = source.timing.endAt !== undefined;
				exactTimingDateOnly = source.timing.timePrecision === 'date';
				break;
			case 'approximate':
				nominalAt = formatTimestampForTimeZoneInput(source.timing.nominalAt, timeZone) ?? '';
				toleranceMinutes = source.timing.toleranceMinutes;
				break;
			case 'window':
				earliestAt = formatTimestampForTimeZoneInput(source.timing.earliestAt, timeZone) ?? '';
				latestAt = formatTimestampForTimeZoneInput(source.timing.latestAt, timeZone) ?? '';
				break;
		}
		notes = source.notes.join('\n');
		locations = source.locations.map(locationDraft);
		links = source.links.map((link) => ({ ...link, isExpanded: false }));
		documents = source.documents.map((document) => ({ ...document, isExpanded: false }));
		reservationEnabled = source.reservation !== undefined;
		reservationProvider = source.reservation?.provider ?? '';
		reservationReference = source.reservation?.reference ?? '';
		reservationStatus = source.reservation?.status ?? 'pending';
		costEnabled = source.cost !== undefined;
		costAmount = source.cost ? amountInputValue(source.cost) : '';
		costCurrency = source.cost?.currency ?? localCurrency;
		costPaid = source.cost?.status === 'paid';
		transportMode = source.type === 'transport' ? source.transport.mode : 'other';
		transportOperator = source.type === 'transport' ? (source.transport.operator ?? '') : '';
		transportServiceNumber = source.type === 'transport' ? (source.transport.serviceNumber ?? '') : '';
		transportSeat = source.type === 'transport' ? (source.transport.seat ?? '') : '';
		fillMissingTransportOperator();
		transportStops = source.type === 'transport' ? source.transport.stops.map((stop) => stopDraft(stop, timeZone)) : [];
		if (timingNeedsConfirmation) {
			timingKind = 'exact';
			startAt = suggestedStartDate ? `${suggestedStartDate}T` : '';
			endAt = suggestedEndDate ? `${suggestedEndDate}T` : '';
			endAtEnabled = suggestedEndDate !== undefined;
		}
	}

	function tripEndpoint(): string {
		return `/api/trips/${encodeURIComponent(tripId)}`;
	}

	function locationResolveEndpoint(): string {
		return `${tripEndpoint()}/locations/resolve`;
	}

	function itemEditEndpoint(): string {
		return `${tripEndpoint()}/items/${encodeURIComponent(item.id)}/edit`;
	}

	function lockEndpoint(): string {
		return mode === 'create' ? `${tripEndpoint()}/edit` : itemEditEndpoint();
	}

	function newIdentifier(): string {
		return crypto.randomUUID();
	}

	function addLocation(): void {
		const location: LocationDraft = {
			address: '',
			googleMapsUrl: '',
			id: newIdentifier(),
			isExpanded: true,
			latitude: '',
			longitude: '',
			name: '',
			openRailwayMapUrl: '',
			role: 'primary'
		};
		addLocationDraft(location);
	}

	function addLocationDraft(location: LocationDraft): void {
		locations = [...locations, location];
		if (itemType === 'transport') {
			transportStops = [...transportStops, newStopDraft(location.id)];
		}
	}

	function removeLocation(locationId: string): void {
		locations = locations.filter((location) => location.id !== locationId);
		transportStops = transportStops.filter((stop) => stop.locationId !== locationId);
	}

	async function importLocation(): Promise<void> {
		const url = locationImportUrl.trim();
		if (!url) {
			locationImportError = 'Paste a Google Maps or OpenRailwayMap link first.';
			return;
		}

		isImportingLocation = true;
		locationImportError = '';
		try {
			const response = await fetch(locationResolveEndpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			const data = await responseData(response);
			const importedLocation = locationResolveResponseSchema.safeParse(data);
			if (!response.ok || !importedLocation.success) {
				locationImportError = errorFrom(data, 'The map link could not be imported.');
				return;
			}

			addLocationDraft({
				address: importedLocation.data.address ?? '',
				googleMapsUrl: importedLocation.data.googleMapsUrl ?? '',
				id: newIdentifier(),
				isExpanded: true,
				latitude: importedLocation.data.coordinates ? String(importedLocation.data.coordinates.latitude) : '',
				longitude: importedLocation.data.coordinates ? String(importedLocation.data.coordinates.longitude) : '',
				name: importedLocation.data.name ?? '',
				openRailwayMapUrl: importedLocation.data.openRailwayMapUrl ?? '',
				role: 'primary'
			});
			locationImportUrl = '';
		} catch {
			locationImportError = 'The map link could not be imported because the server is unavailable.';
		} finally {
			isImportingLocation = false;
		}
	}

	function addLink(): void {
		links = [...links, { isExpanded: true, label: '', url: '' }];
	}

	function addDocument(): void {
		documents = [...documents, { isExpanded: true, kind: 'other', title: '', url: '' }];
	}

	function newStopDraft(locationId: string): StopDraft {
		return {
			inheritsTimingTimeZone: true,
			locationId,
			platform: '',
			scheduledAt: '',
			timeZone: startAtTimeZone
		};
	}

	function stopForLocation(locationId: string): StopDraft | undefined {
		return transportStops.find((stop) => stop.locationId === locationId);
	}

	function addMissingTransportStops(): void {
		const existingLocationIds = new Set(transportStops.map((stop) => stop.locationId));
		const missingStops = locations
			.filter((location) => !existingLocationIds.has(location.id))
			.map((location) => newStopDraft(location.id));
		if (missingStops.length > 0) {
			transportStops = [...transportStops, ...missingStops];
		}
	}

	function changeItemType(value: string): void {
		const parsedType = itineraryItemTypeSchema.safeParse(value);
		if (!parsedType.success) {
			return;
		}

		itemType = parsedType.data;
		if (itemType !== 'accommodation') {
			exactTimingDateOnly = false;
		}
		if (itemType === 'transport') {
			addMissingTransportStops();
		}
	}

	function optionalText(value: string): string | undefined {
		const trimmed = value.trim();
		return trimmed === '' ? undefined : trimmed;
	}

	function amountInputValue(amount: CostAmount): string {
		const fractionDigits = currencyFractionDigits(amount.currency);
		if (fractionDigits === 0) {
			return String(amount.amountMinor);
		}
		const scale = 10 ** fractionDigits;
		const whole = Math.floor(amount.amountMinor / scale);
		const fraction = String(amount.amountMinor % scale).padStart(fractionDigits, '0');
		return `${whole}.${fraction}`;
	}

	function costCandidate(): unknown | undefined {
		if (!costEnabled) {
			return undefined;
		}
		return {
			amountMinor: amountMinorFromInput(costAmount, costCurrency) ?? Number.NaN,
			currency: costCurrency,
			status: costPaid ? 'paid' : 'unpaid'
		};
	}

	function fillMissingTransportOperator(): void {
		if (optionalText(transportOperator)) {
			return;
		}
		const operator = operatorNameForServiceNumber(transportMode, transportServiceNumber);
		if (operator) {
			transportOperator = operator;
		}
	}

	function changeTransportMode(value: string): void {
		const parsedMode = transportModeSchema.safeParse(value);
		if (!parsedMode.success) {
			return;
		}
		transportMode = parsedMode.data;
		fillMissingTransportOperator();
	}

	function changeTransportServiceNumber(value: string): void {
		transportServiceNumber = value;
		fillMissingTransportOperator();
	}

	function coordinateValue(value: string): number {
		return value.trim() === '' ? Number.NaN : Number(value);
	}

	function timeZoneOverride(timeZone: string, defaultTimeZone: string): { timeZone?: string } {
		return timeZone === defaultTimeZone ? {} : { timeZone };
	}

	function timestampValue(value: string, timeZone: string): number {
		return zonedDateTimeToUnixMilliseconds(value, timeZone) ?? Number.NaN;
	}

	function reformatInTimeZone(value: string, timeZone: string): string {
		const currentTimestamp = zonedDateTimeToUnixMilliseconds(value, startAtTimeZone);
		return currentTimestamp !== null && isValidIanaTimeZone(timeZone)
			? (formatTimestampForTimeZoneInput(currentTimestamp, timeZone) ?? value)
			: value;
	}

	function changeItemTimeZone(timeZone: string): void {
		const previousTimeZone = startAtTimeZone;
		switch (timingKind) {
			case 'exact':
				if (!exactTimingDateOnly) {
					startAt = reformatInTimeZone(startAt, timeZone);
					endAt = reformatInTimeZone(endAt, timeZone);
				}
				break;
			case 'approximate':
				nominalAt = reformatInTimeZone(nominalAt, timeZone);
				break;
			case 'window':
				earliestAt = reformatInTimeZone(earliestAt, timeZone);
				latestAt = reformatInTimeZone(latestAt, timeZone);
				break;
		}
		transportStops = transportStops.map((stop) => {
			if (!stop.inheritsTimingTimeZone) {
				return stop;
			}
			const currentTimestamp = zonedDateTimeToUnixMilliseconds(stop.scheduledAt, previousTimeZone);
			return {
				...stop,
				scheduledAt:
					currentTimestamp !== null
						? (formatTimestampForTimeZoneInput(currentTimestamp, timeZone) ?? stop.scheduledAt)
						: stop.scheduledAt,
				timeZone
			};
		});
		startAtTimeZone = timeZone;
	}

	function changeStopTimeZone(stop: StopDraft, timeZone: string): void {
		const currentTimestamp = zonedDateTimeToUnixMilliseconds(stop.scheduledAt, stop.timeZone);
		stop.timeZone = timeZone;
		stop.inheritsTimingTimeZone = timeZone === startAtTimeZone;
		if (currentTimestamp !== null && isValidIanaTimeZone(timeZone)) {
			stop.scheduledAt = formatTimestampForTimeZoneInput(currentTimestamp, timeZone) ?? stop.scheduledAt;
		}
	}

	function initialDateTimeForTiming(): string {
		switch (timingKind) {
			case 'exact':
				return startAt;
			case 'approximate':
				return nominalAt;
			case 'window':
				return earliestAt;
		}
	}

	function changeTimingKind(value: string): void {
		const nextKind = timingKindSchema.safeParse(value);
		if (!nextKind.success || nextKind.data === timingKind) {
			return;
		}

		const initialDateTime = initialDateTimeForTiming();
		switch (nextKind.data) {
			case 'exact':
				startAt ||= initialDateTime;
				break;
			case 'approximate':
				nominalAt ||= initialDateTime;
				break;
			case 'window':
				earliestAt ||= initialDateTime;
				latestAt ||= initialDateTime;
				break;
		}
		timingKind = nextKind.data;
	}

	function changeExactTimingDateOnly(enabled: boolean): void {
		exactTimingDateOnly = enabled;
		if (!enabled) {
			return;
		}
		const startDate = startAt.slice(0, 10);
		const endDate = (endAtEnabled ? endAt : startAt).slice(0, 10);
		startAt = `${startDate}T00:00`;
		endAt = `${endDate}T23:59`;
		endAtEnabled = true;
	}

	function locationValue(draft: LocationDraft): unknown {
		const address = optionalText(draft.address);
		const googleMapsUrl = optionalText(draft.googleMapsUrl);
		const openRailwayMapUrl = optionalText(draft.openRailwayMapUrl);
		const hasCoordinates = draft.latitude.trim() !== '' || draft.longitude.trim() !== '';
		return {
			id: draft.id.trim(),
			role: draft.role,
			name: draft.name.trim(),
			...(address ? { address } : {}),
			...(googleMapsUrl ? { googleMapsUrl } : {}),
			...(openRailwayMapUrl ? { openRailwayMapUrl } : {}),
			...(hasCoordinates
				? {
						coordinates: {
							latitude: coordinateValue(draft.latitude),
							longitude: coordinateValue(draft.longitude)
						}
					}
				: {})
		};
	}

	function timingCandidate(): unknown {
		const override = timeZoneOverride(startAtTimeZone, tripTimeZone);
		switch (timingKind) {
			case 'exact': {
				const end = optionalText(endAt);
				return {
					kind: 'exact',
					startAt: timestampValue(startAt, startAtTimeZone),
					...override,
					...(endAtEnabled && end ? { endAt: timestampValue(end, startAtTimeZone) } : {}),
					...(exactTimingDateOnly ? { timePrecision: 'date' as const } : {})
				};
			}
			case 'approximate':
				return {
					kind: 'approximate',
					nominalAt: timestampValue(nominalAt, startAtTimeZone),
					...override,
					toleranceMinutes
				};
			case 'window':
				return {
					kind: 'window',
					earliestAt: timestampValue(earliestAt, startAtTimeZone),
					latestAt: timestampValue(latestAt, startAtTimeZone),
					...override
				};
		}
	}

	function itemCandidate(): unknown {
		const cost = costCandidate();
		const reservation = reservationEnabled
			? {
					status: reservationStatus,
					...(optionalText(reservationProvider) ? { provider: optionalText(reservationProvider) } : {}),
					...(optionalText(reservationReference) ? { reference: optionalText(reservationReference) } : {})
				}
			: undefined;
		const common = {
			id: item.id,
			timing: timingCandidate(),
			title: title.trim(),
			locations: locations.map(locationValue),
			notes: notes
				.split(/\r?\n/)
				.map((note) => note.trim())
				.filter((note) => note.length > 0),
			links: links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
			documents: documents.map((document) => ({
				kind: document.kind,
				title: document.title.trim(),
				url: document.url.trim()
			})),
			...(cost ? { cost } : {}),
			...(reservation ? { reservation } : {})
		};

		if (itemType !== 'transport') {
			return { ...common, type: itemType };
		}

		return {
			...common,
			type: itemType,
			transport: {
				mode: transportMode,
				...(optionalText(transportOperator) ? { operator: optionalText(transportOperator) } : {}),
				...(optionalText(transportServiceNumber) ? { serviceNumber: optionalText(transportServiceNumber) } : {}),
				...(optionalText(transportSeat) ? { seat: optionalText(transportSeat) } : {}),
				stops: transportStops.map((stop) => {
					const scheduledAt = optionalText(stop.scheduledAt);
					return {
						locationId: stop.locationId.trim(),
						...(scheduledAt ? { scheduledAt: timestampValue(scheduledAt, stop.timeZone) } : {}),
						...(stop.inheritsTimingTimeZone ? {} : timeZoneOverride(stop.timeZone, startAtTimeZone)),
						...(optionalText(stop.platform) ? { platform: optionalText(stop.platform) } : {})
					};
				})
			}
		};
	}

	function validateDateTimes(): string | null {
		if (!isValidIanaTimeZone(startAtTimeZone)) {
			return 'Time zone: use a valid IANA time zone such as Asia/Tokyo.';
		}

		const timingInputs =
			timingKind === 'exact'
				? [
						{ label: 'Start date and time', value: startAt },
						...(endAtEnabled ? [{ label: 'End date and time', value: endAt }] : [])
					]
				: timingKind === 'approximate'
					? [{ label: 'Approximate date and time', value: nominalAt }]
					: [
							{ label: 'Earliest date and time', value: earliestAt },
							{ label: 'Latest date and time', value: latestAt }
						];

		for (const input of timingInputs) {
			if (zonedDateTimeToUnixMilliseconds(input.value, startAtTimeZone) === null) {
				return `${input.label}: enter a valid local time. Times skipped by daylight saving cannot be used.`;
			}
		}

		if (timingKind === 'exact' && endAtEnabled && endAt.trim() === '') {
			return 'End date and time: complete the end time or turn it off.';
		}

		for (const [index, stop] of transportStops.entries()) {
			const scheduledAt = optionalText(stop.scheduledAt);
			if (!scheduledAt) {
				continue;
			}
			if (!isValidIanaTimeZone(stop.timeZone)) {
				return `Stop ${index + 1} time zone: use a valid IANA time zone such as Asia/Tokyo.`;
			}
			if (zonedDateTimeToUnixMilliseconds(scheduledAt, stop.timeZone) === null) {
				return `Stop ${index + 1} scheduled date and time is not a valid local time.`;
			}
		}

		return null;
	}

	function validateCost(): string | null {
		if (!costEnabled) {
			return null;
		}
		const amountMinor = amountMinorFromInput(costAmount, costCurrency);
		if (amountMinor === null || amountMinor < 1) {
			return `Cost: enter a positive ${costCurrency} amount with no more than ${currencyFractionDigits(costCurrency)} decimal places.`;
		}
		return null;
	}

	function validateItem(): ItemValidation {
		const dateTimeError = validateDateTimes();
		if (dateTimeError) {
			return { error: dateTimeError, valid: false };
		}
		const costError = validateCost();
		if (costError) {
			return { error: costError, valid: false };
		}
		const validation = itineraryItemDraftSchema.safeParse(itemCandidate());
		if (validation.success) {
			return { item: validation.data, valid: true };
		}
		return {
			error: formatValidationIssues(validation.error.issues, 'item'),
			valid: false
		};
	}

	function confirmDiscard(): boolean {
		return !hasUnsavedChanges || window.confirm('Discard your unsaved changes?');
	}

	function handleDialogCancel(event: Event): void {
		if (!confirmDiscard()) {
			event.preventDefault();
		}
	}

	function scrollToSection(sectionId: EditorSectionId): void {
		const section = editorElement.querySelector<HTMLElement>(`#${sectionId}`);
		const header = editorElement.querySelector<HTMLElement>('.editor-header');
		if (!section || !header) {
			return;
		}

		const editorBounds = editorElement.getBoundingClientRect();
		const sectionBounds = section.getBoundingClientRect();
		const targetTop = editorElement.scrollTop + sectionBounds.top - editorBounds.top - header.offsetHeight - 16;
		editorElement.scrollTo({ behavior: 'smooth', top: Math.max(0, targetTop) });
	}

	onMount(() => {
		timeZoneOptions = browserTimeZoneOptions();
		populateDraft(item, tripTimeZone);
		initialDraftFingerprint = JSON.stringify(itemCandidate());
		dialogElement.showModal();
		void acquireLock();

		return () => {
			if (heartbeat) {
				clearInterval(heartbeat);
			}
			void releaseLock(true);
		};
	});

	async function responseData(response: Response): Promise<unknown> {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}

	function errorFrom(data: unknown, fallback: string): string {
		const parsed = apiErrorSchema.safeParse(data);
		return parsed.success ? parsed.data.message : fallback;
	}

	function stopHeartbeat(): void {
		if (heartbeat) {
			clearInterval(heartbeat);
			heartbeat = undefined;
		}
	}

	function startHeartbeat(): void {
		stopHeartbeat();
		heartbeat = setInterval(() => {
			void renewLock();
		}, 60_000);
	}

	async function acquireLock(): Promise<void> {
		try {
			const response = await fetch(lockEndpoint(), { method: 'POST' });
			const data = await responseData(response);
			const lock = editLockResponseSchema.safeParse(data);
			if (!response.ok || !lock.success) {
				editorState = 'error';
				errorMessage = errorFrom(data, 'The edit lock could not be acquired.');
				return;
			}

			lockToken = lock.data.token;
			editorState = 'editing';
			startHeartbeat();
		} catch {
			editorState = 'error';
			errorMessage = 'The edit lock could not be acquired because the server is unavailable.';
		}
	}

	async function renewLock(): Promise<void> {
		const token = lockToken;
		if (!token) {
			return;
		}

		try {
			const response = await fetch(lockEndpoint(), {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lockToken: token })
			});
			const data = await responseData(response);
			if (response.ok && editLockResponseSchema.safeParse(data).success) {
				return;
			}

			if (response.status === 423) {
				lockToken = null;
				errorMessage = errorFrom(data, 'The edit lock has expired.');
			} else {
				errorMessage = errorFrom(
					data,
					'The lock could not be confirmed. It will remain held until you cancel or it expires.'
				);
			}
		} catch {
			errorMessage =
				'The lock could not be confirmed because the server is unavailable. It will remain held until you cancel or it expires.';
		}

		stopHeartbeat();
		editorState = 'error';
	}

	async function releaseLock(keepalive = false): Promise<boolean> {
		if (!lockToken) {
			return true;
		}

		const token = lockToken;
		try {
			const response = await fetch(lockEndpoint(), {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lockToken: token }),
				keepalive
			});
			if (response.ok || response.status === 423) {
				lockToken = null;
				return true;
			}

			errorMessage = errorFrom(await responseData(response), 'The edit lock could not be released.');
			return false;
		} catch {
			errorMessage = 'The edit lock could not be released because the server is unavailable.';
			return false;
		}
	}

	async function cancelEditing(): Promise<void> {
		if (!confirmDiscard()) {
			return;
		}
		if (!(await releaseLock())) {
			editorState = 'error';
			return;
		}
		dialogElement.close();
	}

	async function saveEditing(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const token = lockToken;
		if (!token) {
			return;
		}

		const validation = validateItem();
		if (!validation.valid) {
			editorState = 'editing';
			errorMessage = validation.error;
			return;
		}

		editorState = 'saving';
		errorMessage = '';

		try {
			const response =
				mode === 'create'
					? await fetch(`${tripEndpoint()}/items`, {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ item: validation.item, lockToken: token, revision })
						})
					: await fetch(itemEditEndpoint(), {
							method: 'PUT',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ item: validation.item, lockToken: token, revision })
						});
			const data = await responseData(response);
			if (!response.ok || !editSaveResponseSchema.safeParse(data).success) {
				editorState = 'editing';
				errorMessage = errorFrom(data, 'The item could not be saved.');
				return;
			}
		} catch {
			editorState = 'editing';
			errorMessage = 'The item could not be saved because the server is unavailable.';
			return;
		}

		lockToken = null;
		stopHeartbeat();
		await onSaved();
	}
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="item-editor-heading"
	use:draggableDialog={{ canDismiss: confirmDiscard, handleSelector: '[data-dialog-drag-handle]' }}
	oncancel={handleDialogCancel}
	onclose={onDismiss}
>
	<form
		bind:this={editorElement}
		class="editor shiori-form"
		data-dialog-scroll-area
		onsubmit={saveEditing}
		style={itemTypeAccentStyle(itemType)}
	>
		<header class="editor-header" data-dialog-drag-handle>
			<div>
				<p class="eyebrow">{mode === 'create' ? 'New itinerary item' : `Edit ${itemType}`}</p>
				<h2 id="item-editor-heading">{mode === 'create' ? 'Add item' : item.title}</h2>
				{#if editorState === 'editing' || editorState === 'saving'}
					<p class:changed={hasUnsavedChanges} class="editor-status">
						{editorState === 'saving' ? 'Saving changes…' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
					</p>
				{/if}
			</div>
			<div class="editor-actions">
				{#if editorState === 'editing' || editorState === 'saving'}
					<button class="save-button shiori-form-button" disabled={editorState === 'saving'} type="submit">
						{editorState === 'saving' ? 'Saving…' : mode === 'create' ? 'Create item' : 'Save changes'}
					</button>
				{/if}
				<button
					class="close-button shiori-form-button"
					disabled={editorState === 'saving'}
					onclick={cancelEditing}
					type="button"
				>
					Cancel
				</button>
			</div>
		</header>

		{#if editorState === 'acquiring'}
			<p>Acquiring edit lock…</p>
		{:else if editorState === 'editing' || editorState === 'saving'}
			<div class="editor-layout">
				<nav aria-label="Edit sections" class="section-nav">
					<button onclick={() => scrollToSection('editor-overview')} type="button">Overview</button>
					<button onclick={() => scrollToSection('editor-schedule')} type="button">Schedule</button>
					<button onclick={() => scrollToSection('editor-places')} type="button">Places</button>
					{#if itemType === 'transport'}
						<button onclick={() => scrollToSection('editor-transport')} type="button">Transport</button>
					{/if}
					<button onclick={() => scrollToSection('editor-links')} type="button">Links</button>
					<button onclick={() => scrollToSection('editor-cost')} type="button">Cost</button>
					<button onclick={() => scrollToSection('editor-private')} type="button">Private</button>
				</nav>
				<div class="editor-sections">
					<fieldset id="editor-overview">
						<legend>Overview</legend>
						<label class="shiori-form-label">
							Type
							<select
								class="shiori-form-control"
								value={itemType}
								onchange={(event) => changeItemType(event.currentTarget.value)}
							>
								{#each itemTypeOptions as option (option)}
									<option value={option}>{option}</option>
								{/each}
							</select>
						</label>
						<label class="shiori-form-label">
							Title
							<input class="shiori-form-control" bind:value={title} required />
						</label>
						<label class="shiori-form-label">
							Notes <span class="field-hint">One note per line.</span>
							<textarea class="shiori-form-control" bind:value={notes} rows="5"></textarea>
						</label>
					</fieldset>

					<fieldset id="editor-schedule">
						<legend>Schedule</legend>
						{#if timingNeedsConfirmation}
							<p class="timing-confirmation">
								{suggestedStartDate && suggestedEndDate
									? `The imported link confirms ${suggestedStartDate} to ${suggestedEndDate}. Add the check-in and check-out times before saving.`
									: suggestedStartDate
										? `The imported link confirms ${suggestedStartDate}. Add the time before saving.`
										: 'The imported link did not include a reliable time. Confirm the schedule before saving.'}
							</p>
						{/if}
						<label class="shiori-form-label">
							Timing
							<select
								class="shiori-form-control"
								value={timingKind}
								onchange={(event) => changeTimingKind(event.currentTarget.value)}
							>
								{#each timingKindOptions as option (option)}
									<option value={option}>{timingKindLabels[option]}</option>
								{/each}
							</select>
						</label>

						{#if timingKind === 'exact'}
							{#if itemType === 'accommodation'}
								<label class="toggle-label">
									<input
										checked={exactTimingDateOnly}
										onchange={(event) => changeExactTimingDateOnly(event.currentTarget.checked)}
										type="checkbox"
									/>
									Check-in and check-out times are unknown
								</label>
							{/if}
							<DateTimeInput
								dateTime={startAt}
								id="item-start"
								label={exactTimingDateOnly
									? 'Check-in date'
									: timingNeedsConfirmation && suggestedStartDate
										? 'Start time'
										: 'Start date and time'}
								onDateTimeChange={(value) => (startAt = value)}
								onTimeZoneChange={changeItemTimeZone}
								pickerMode={exactTimingDateOnly
									? 'date'
									: timingNeedsConfirmation && suggestedStartDate
										? 'time'
										: 'date-time'}
								timeZoneHint="Saved with this timing."
								timeZone={startAtTimeZone}
								{timeZoneOptions}
							/>
							{#if !exactTimingDateOnly}
								<label class="toggle-label">
									<input bind:checked={endAtEnabled} type="checkbox" />
									Include an end time
								</label>
							{/if}
							{#if endAtEnabled}
								<DateTimeInput
									dateTime={endAt}
									id="item-end"
									label={exactTimingDateOnly
										? 'Check-out date'
										: timingNeedsConfirmation && suggestedEndDate
											? 'End time'
											: 'End date and time'}
									onDateTimeChange={(value) => (endAt = value)}
									onTimeZoneChange={changeItemTimeZone}
									pickerMode={exactTimingDateOnly
										? 'date'
										: timingNeedsConfirmation && suggestedEndDate
											? 'time'
											: 'date-time'}
									timeZoneHint="Saved with this timing."
									timeZone={startAtTimeZone}
									{timeZoneOptions}
								/>
							{/if}
						{:else if timingKind === 'approximate'}
							<DateTimeInput
								dateTime={nominalAt}
								id="item-approximate"
								label="Approximate date and time"
								onDateTimeChange={(value) => (nominalAt = value)}
								onTimeZoneChange={changeItemTimeZone}
								timeZoneHint="Saved with this timing."
								timeZone={startAtTimeZone}
								{timeZoneOptions}
							/>
							<label class="shiori-form-label">
								Tolerance <span class="field-hint">Minutes either side of the nominal time.</span>
								<input
									class="shiori-form-control"
									bind:value={toleranceMinutes}
									max="1440"
									min="1"
									step="1"
									type="number"
								/>
							</label>
						{:else if timingKind === 'window'}
							<DateTimeInput
								dateTime={earliestAt}
								id="item-earliest"
								label="Earliest date and time"
								onDateTimeChange={(value) => (earliestAt = value)}
								onTimeZoneChange={changeItemTimeZone}
								timeZoneHint="Saved with this timing."
								timeZone={startAtTimeZone}
								{timeZoneOptions}
							/>
							<DateTimeInput
								dateTime={latestAt}
								id="item-latest"
								label="Latest date and time"
								onDateTimeChange={(value) => (latestAt = value)}
								onTimeZoneChange={changeItemTimeZone}
								timeZoneHint="Saved with this timing."
								timeZone={startAtTimeZone}
								{timeZoneOptions}
							/>
						{/if}
					</fieldset>

					<fieldset id="editor-places">
						<legend>Places</legend>
						<div class="location-map-import">
							<label class="shiori-form-label">
								Import from a map link
								<input
									class="shiori-form-control"
									bind:value={locationImportUrl}
									inputmode="url"
									placeholder="Paste a Google Maps or OpenRailwayMap link"
								/>
							</label>
							<button
								class="shiori-form-button"
								disabled={isImportingLocation}
								onclick={() => void importLocation()}
								type="button"
							>
								{isImportingLocation ? 'Importing…' : 'Import location'}
							</button>
						</div>
						{#if locationImportError}
							<p class="error" role="alert">{locationImportError}</p>
						{/if}
						<div class="collection">
							{#each locations as location, index (location.id)}
								<details bind:open={location.isExpanded} class="collection-entry">
									<summary>
										<span>Location {index + 1}</span>
										<span>{location.name || 'New location'}</span>
									</summary>
									<div class="entry-body">
										<div class="entry-heading">
											<button class="text-button" onclick={() => removeLocation(location.id)} type="button">
												Remove
											</button>
										</div>
										<div class="field-grid">
											<label class="shiori-form-label">
												Name
												<input class="shiori-form-control" bind:value={location.name} />
											</label>
											<label class="shiori-form-label">
												Role
												<select class="shiori-form-control" bind:value={location.role}>
													{#each locationRoleOptions as option (option)}
														<option value={option}>{option}</option>
													{/each}
												</select>
											</label>
										</div>
										<label class="shiori-form-label">
											Address
											<input class="shiori-form-control" bind:value={location.address} />
										</label>
										<label class="shiori-form-label">
											Google Maps link <span class="field-hint">Shown with this location.</span>
											<input class="shiori-form-control" bind:value={location.googleMapsUrl} inputmode="url" />
										</label>
										<label class="shiori-form-label">
											OpenRailwayMap link <span class="field-hint">Shown with this location.</span>
											<input class="shiori-form-control" bind:value={location.openRailwayMapUrl} inputmode="url" />
										</label>
										<div class="field-grid">
											<label class="shiori-form-label">
												Latitude
												<input class="shiori-form-control" bind:value={location.latitude} inputmode="decimal" />
											</label>
											<label class="shiori-form-label">
												Longitude
												<input class="shiori-form-control" bind:value={location.longitude} inputmode="decimal" />
											</label>
										</div>
									</div>
								</details>
							{/each}
						</div>
						<button class="text-button" onclick={addLocation} type="button">Add location</button>
					</fieldset>

					{#if itemType === 'transport'}
						<fieldset id="editor-transport">
							<legend>Transport</legend>
							<div class="field-grid">
								<label class="shiori-form-label">
									Mode
									<select
										class="shiori-form-control"
										value={transportMode}
										onchange={(event) => changeTransportMode(event.currentTarget.value)}
									>
										{#each transportModeOptions as option (option)}
											<option value={option}>{option}</option>
										{/each}
									</select>
								</label>
								<label class="shiori-form-label">
									Operator
									<input class="shiori-form-control" bind:value={transportOperator} />
								</label>
							</div>
							<div class="field-grid">
								<label class="shiori-form-label">
									Service number
									<input
										class="shiori-form-control"
										value={transportServiceNumber}
										oninput={(event) => changeTransportServiceNumber(event.currentTarget.value)}
									/>
								</label>
								<label class="shiori-form-label">
									Seat <span class="field-hint">Admin and sudo only.</span>
									<input class="shiori-form-control" bind:value={transportSeat} />
								</label>
							</div>
							{#if locations.length === 0}
								<p class="transport-empty">Add locations under Places before adding stop details.</p>
							{:else}
								<div class="transport-location-list">
									{#each locations as location, locationIndex (location.id)}
										{@const stop = stopForLocation(location.id)}
										<section class="transport-location">
											<div class="transport-location-heading">
												<div>
													<strong>{location.name || `Location ${locationIndex + 1}`}</strong>
													<span>{location.role.replace('-', ' ')}</span>
												</div>
											</div>
											{#if stop}
												<div class="stop-timing">
													<DateTimeInput
														dateTime={stop.scheduledAt}
														id={`stop-${locationIndex}-scheduled`}
														label="Scheduled date and time"
														onDateTimeChange={(value) => (stop.scheduledAt = value)}
														onTimeZoneChange={(timeZone) => changeStopTimeZone(stop, timeZone)}
														timeZoneHint="Saved with this stop."
														timeZone={stop.timeZone}
														{timeZoneOptions}
													/>
													<label class="shiori-form-label">
														Platform <span class="field-hint">Admin and sudo only.</span>
														<input class="shiori-form-control" bind:value={stop.platform} />
													</label>
												</div>
											{:else}
												<p class="transport-empty">Stop details are missing for this location.</p>
											{/if}
										</section>
									{/each}
								</div>
							{/if}
						</fieldset>
					{/if}

					<fieldset id="editor-links">
						<legend>Links</legend>
						<div class="collection">
							{#each links as link, index (index)}
								<details bind:open={link.isExpanded} class="collection-entry">
									<summary>
										<span>Link {index + 1}</span>
										<span>{link.label || 'New link'}</span>
									</summary>
									<div class="entry-body">
										<div class="entry-heading">
											<button
												class="text-button"
												onclick={() => (links = links.filter((_, current) => current !== index))}
												type="button"
											>
												Remove
											</button>
										</div>
										<label class="shiori-form-label">
											Label
											<input class="shiori-form-control" bind:value={link.label} />
										</label>
										<label class="shiori-form-label">
											URL
											<input class="shiori-form-control" bind:value={link.url} inputmode="url" />
										</label>
									</div>
								</details>
							{/each}
						</div>
						<button class="text-button" onclick={addLink} type="button">Add link</button>
					</fieldset>

					<fieldset class="sensitive-section" id="editor-cost">
						<legend>Cost</legend>
						<p>Only admin and sudo accounts can view costs.</p>
						<label class="toggle-label">
							<input bind:checked={costEnabled} type="checkbox" />
							Add a cost
						</label>
						{#if costEnabled}
							<div class="field-grid">
								<label class="shiori-form-label">
									Charged amount
									<input class="shiori-form-control" bind:value={costAmount} inputmode="decimal" placeholder="0.00" />
								</label>
								<label class="shiori-form-label">
									Charged currency
									<select bind:value={costCurrency} class="shiori-form-control">
										{#each currencyOptions as currency (currency)}
											<option value={currency}>{currency}</option>
										{/each}
									</select>
								</label>
							</div>
							<label class="toggle-label">
								<input bind:checked={costPaid} type="checkbox" />
								Mark as paid
							</label>
							{#if costPaid}
								<p class="field-hint">
									Shiori saves the ECB rate and {localCurrency} equivalent when you save this paid cost.
								</p>
							{/if}
							{#if item.cost?.status === 'paid'}
								<p class="field-hint">
									This paid cost keeps its saved rate. To correct its amount or currency, mark it unpaid and save first.
								</p>
							{/if}
						{/if}
					</fieldset>

					<fieldset class="sensitive-section" id="editor-private">
						<legend>Private details</legend>
						<p>Only admin and sudo accounts can view these details.</p>
						<label class="toggle-label">
							<input bind:checked={reservationEnabled} type="checkbox" />
							Add reservation details
						</label>
						{#if reservationEnabled}
							<div class="field-grid">
								<label class="shiori-form-label">
									Status
									<select class="shiori-form-control" bind:value={reservationStatus}>
										{#each reservationStatusOptions as option (option)}
											<option value={option}>{option}</option>
										{/each}
									</select>
								</label>
								<label class="shiori-form-label">
									Provider
									<input class="shiori-form-control" bind:value={reservationProvider} />
								</label>
							</div>
							<label class="shiori-form-label">
								Reference
								<input class="shiori-form-control" bind:value={reservationReference} />
							</label>
						{/if}
						<div class="collection">
							{#each documents as document, index (index)}
								<details bind:open={document.isExpanded} class="collection-entry">
									<summary>
										<span>Document {index + 1}</span>
										<span>{document.title || 'New document'}</span>
									</summary>
									<div class="entry-body">
										<div class="entry-heading">
											<button
												class="text-button"
												onclick={() => (documents = documents.filter((_, current) => current !== index))}
												type="button"
											>
												Remove
											</button>
										</div>
										<div class="field-grid">
											<label class="shiori-form-label">
												Title
												<input class="shiori-form-control" bind:value={document.title} />
											</label>
											<label class="shiori-form-label">
												Kind
												<select class="shiori-form-control" bind:value={document.kind}>
													{#each documentKindOptions as option (option)}
														<option value={option}>{option}</option>
													{/each}
												</select>
											</label>
										</div>
										<label class="shiori-form-label">
											URL
											<input class="shiori-form-control" bind:value={document.url} inputmode="url" />
										</label>
									</div>
								</details>
							{/each}
						</div>
						<button class="text-button" onclick={addDocument} type="button">Add document reference</button>
					</fieldset>

					{#if errorMessage}
						<p class="error" role="alert">{errorMessage}</p>
					{/if}
				</div>
			</div>
		{:else}
			<p class="error" role="alert">{errorMessage}</p>
			<button class="retry-button shiori-form-button" onclick={cancelEditing} type="button">
				{lockToken ? 'Retry release' : 'Close'}
			</button>
		{/if}
	</form>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-height: calc(100dvh - 2rem);
		max-width: min(48rem, calc(100% - 2rem));
		padding: 0;
		width: 100%;
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 88%, transparent);
	}

	.editor {
		background: var(--color-surface-raised);
		border: 1px solid var(--item-accent);
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: 0;
	}

	.editor-header,
	.entry-heading {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.editor-header {
		background: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border-default);
		cursor: move;
		padding: clamp(1rem, 3vw, 1.5rem);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.editor-actions {
		align-items: start;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: end;
	}

	.editor-status {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		margin: 0.5rem 0 0;
	}

	.editor-status.changed {
		color: var(--color-state-warning);
	}

	.editor-layout {
		display: grid;
		gap: 1rem;
		grid-template-columns: 8rem minmax(0, 1fr);
		padding: clamp(1rem, 3vw, 1.5rem);
	}

	.section-nav {
		align-content: start;
		display: grid;
		gap: 0.125rem;
	}

	.section-nav button {
		appearance: none;
		background: transparent;
		border: 0;
		border-left: 2px solid var(--color-border-default);
		color: var(--color-text-muted);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.5rem 0.625rem;
		text-align: left;
		text-transform: uppercase;
	}

	.section-nav button:hover,
	.section-nav button:focus-visible {
		border-color: var(--item-accent);
		color: var(--color-text-primary);
	}

	.section-nav button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: 0.125rem;
	}

	.editor-sections {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	h2,
	p {
		margin-top: 0;
	}

	h2 {
		margin-bottom: 0;
	}

	.eyebrow,
	.field-hint {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.eyebrow {
		color: var(--item-accent);
		margin-bottom: 0.25rem;
	}

	.field-hint {
		font-size: 0.625rem;
		letter-spacing: 0.04em;
	}

	fieldset {
		border: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.875rem;
		margin: 0;
		padding: 1rem;
		scroll-margin-top: 7rem;
	}

	legend {
		font-size: 0.8125rem;
		font-weight: 700;
		padding: 0 0.25rem;
	}

	textarea {
		resize: vertical;
	}

	.field-grid {
		display: grid;
		gap: 0.875rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.collection {
		display: grid;
		gap: 0.75rem;
	}

	.location-map-import {
		align-items: end;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.collection-entry {
		border: 1px solid var(--color-border-subtle);
	}

	.collection-entry summary {
		align-items: center;
		cursor: pointer;
		display: grid;
		font-size: 0.8125rem;
		font-weight: 700;
		gap: 0.75rem;
		grid-template-columns: auto minmax(0, 1fr) auto;
		list-style: none;
		padding: 0.625rem 0.75rem;
	}

	.collection-entry summary::-webkit-details-marker {
		display: none;
	}

	.collection-entry summary::after {
		color: var(--color-text-muted);
		content: '+';
		font-size: 1rem;
		line-height: 1;
	}

	.collection-entry[open] summary {
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.collection-entry[open] summary::after {
		content: '−';
	}

	.collection-entry summary span:last-child {
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.entry-body {
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.text-button {
		background: transparent;
		border: 0;
		color: var(--color-text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}

	.text-button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.sensitive-section {
		border-color: var(--color-state-warning);
	}

	.sensitive-section > p {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		margin-bottom: 0;
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

	.close-button,
	.retry-button {
		align-self: start;
	}

	.save-button {
		justify-self: start;
	}

	.error {
		color: var(--color-state-error);
		margin-bottom: 0;
		white-space: pre-wrap;
	}

	.timing-confirmation {
		background: color-mix(in srgb, var(--color-state-warning) 12%, transparent);
		border-left: 3px solid var(--color-state-warning);
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		line-height: 1.45;
		margin: 0;
		padding: 0.625rem 0.75rem;
	}

	.editor > p,
	.editor > .retry-button {
		margin: 1rem;
	}

	.stop-timing {
		display: grid;
		gap: 0.875rem;
	}

	.transport-location-list {
		display: grid;
		gap: 0.75rem;
	}

	.transport-location {
		border: 1px solid var(--color-border-subtle);
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.transport-location-heading {
		align-items: start;
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
	}

	.transport-location-heading > div {
		display: grid;
		gap: 0.125rem;
	}

	.transport-location-heading span,
	.transport-empty {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.transport-empty {
		margin: 0;
	}

	@media (max-width: 40rem) {
		.editor-header {
			flex-direction: column;
		}

		.editor-actions {
			justify-content: start;
		}

		.editor-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.section-nav {
			display: flex;
			overflow-x: auto;
		}

		.section-nav button {
			border-bottom: 2px solid var(--color-border-default);
			border-left: 0;
			white-space: nowrap;
		}

		.field-grid {
			grid-template-columns: 1fr;
		}

		.location-map-import {
			grid-template-columns: 1fr;
		}
	}
</style>
