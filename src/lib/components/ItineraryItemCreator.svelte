<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		apiErrorSchema,
		googleMapsLocationResolveResponseSchema,
		itineraryItemImportResponseSchema,
		type ItineraryItemImport
	} from '$lib/editing/contracts';
	import {
		transportJourneyDraftFromImport,
		transportJourneyDraftSchema,
		transportJourneyTitle,
		type TransportJourneyDraft
	} from '$lib/itinerary/transport-journey';
	import type { TransportJourneySchedule } from '$lib/itinerary/transport-schedule';
	import { formatTimestampForTimeZoneInput } from '$lib/itinerary/zoned-time';
	import {
		transportModeSchema,
		type ItineraryItemType,
		type ItineraryLink,
		type TransportDetails
	} from '$lib/itinerary/schema';

	type CreatorState =
		| 'entry'
		| 'importing'
		| 'review'
		| 'transport-departure'
		| 'transport-arrival'
		| 'transport-details'
		| 'transport-review';
	type TransportEndpointKind = 'departure' | 'arrival';
	type TransportEndpointDraft = {
		coordinates?: { latitude: number; longitude: number };
		googleMapsUrl: string;
		name: string;
	};

	let {
		tripId,
		onDismiss,
		onManual,
		onImported,
		onTransportJourney
	}: {
		tripId: string;
		onDismiss: () => void;
		onManual: (type: ItineraryItemType) => void;
		onImported: (item: ItineraryItemImport) => void;
		onTransportJourney: (journey: TransportJourneyDraft) => void;
	} = $props();

	let dialogElement: HTMLDialogElement;
	let url = $state('');
	let errorMessage = $state('');
	let creatorState = $state<CreatorState>('entry');
	let importedItems = $state<ItineraryItemImport[]>([]);
	let transportErrorMessage = $state('');
	let resolvingEndpoint = $state<TransportEndpointKind | null>(null);
	let departure = $state<TransportEndpointDraft>({ googleMapsUrl: '', name: '' });
	let arrival = $state<TransportEndpointDraft>({ googleMapsUrl: '', name: '' });
	let transportMode = $state<TransportDetails['mode']>('other');
	let transportOperator = $state('');
	let transportServiceNumber = $state('');
	let transportTitle = $state('');
	let suggestedStartDate = $state('');
	let transportSourceLinks = $state<ItineraryLink[]>([]);
	let transportSchedule = $state<TransportJourneySchedule | undefined>(undefined);

	const transportModeOptions = transportModeSchema.options;

	function endpoint(): string {
		return `/api/trips/${encodeURIComponent(tripId)}/items/import`;
	}

	function googleMapsResolveEndpoint(): string {
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
			errorMessage = 'Paste a Google Maps or Google Flights link first.';
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
		dialogElement.close();
		onManual(type);
	}

	function selectImportedItem(item: ItineraryItemImport): void {
		if (item.type === 'transport') {
			startTransportJourney(item);
			return;
		}
		dialogElement.close();
		onImported(item);
	}

	function retryImport(): void {
		creatorState = 'entry';
		errorMessage = '';
		importedItems = [];
	}

	function importedItemDescription(item: ItineraryItemImport): string {
		if (item.type !== 'transport') {
			return 'Activity details were detected.';
		}
		const route = item.locations.map((location) => location.name).join(' → ');
		const service = item.transport.operator
			? `${item.transport.operator}${item.transport.serviceNumber ? ` ${item.transport.serviceNumber}` : ''} · `
			: item.transport.serviceNumber
				? `${item.transport.serviceNumber} · `
				: '';
		return `${service}${route}`;
	}

	function emptyTransportEndpoint(): TransportEndpointDraft {
		return { googleMapsUrl: '', name: '' };
	}

	function optionalText(value: string): string | undefined {
		const trimmed = value.trim();
		return trimmed === '' ? undefined : trimmed;
	}

	function assignEndpoint(endpoint: TransportEndpointDraft, value: TransportJourneyDraft['departure']): void {
		endpoint.name = value.name;
		endpoint.googleMapsUrl = value.googleMapsUrl ?? '';
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
		}
		creatorState = item && transportSchedule ? 'transport-review' : 'transport-departure';
	}

	function endpointFor(kind: TransportEndpointKind): TransportEndpointDraft {
		return kind === 'departure' ? departure : arrival;
	}

	function endpointLabel(kind: TransportEndpointKind): string {
		return kind === 'departure' ? 'departure' : 'arrival';
	}

	function endpointValue(endpointDraft: TransportEndpointDraft): TransportJourneyDraft['departure'] {
		const googleMapsUrl = optionalText(endpointDraft.googleMapsUrl);
		return {
			name: endpointDraft.name.trim(),
			...(googleMapsUrl ? { googleMapsUrl } : {}),
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
		dialogElement.close();
		onTransportJourney(journey.data);
	}

	async function resolveTransportEndpoint(kind: TransportEndpointKind): Promise<void> {
		const endpointDraft = endpointFor(kind);
		const url = endpointDraft.googleMapsUrl.trim();
		if (url === '') {
			transportErrorMessage = `Paste a Google Maps link to look up the ${endpointLabel(kind)}.`;
			return;
		}

		resolvingEndpoint = kind;
		transportErrorMessage = '';
		try {
			const response = await fetch(googleMapsResolveEndpoint(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			const data = await responseData(response);
			const importedLocation = googleMapsLocationResolveResponseSchema.safeParse(data);
			if (!response.ok || !importedLocation.success) {
				transportErrorMessage = errorFrom(data, `The ${endpointLabel(kind)} could not be imported.`);
				return;
			}

			endpointDraft.googleMapsUrl = importedLocation.data.googleMapsUrl;
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
		return formatTimestampForTimeZoneInput(point.scheduledAt, point.timeZone)?.replace('T', ' ') ?? 'Unavailable';
	}

	onMount(() => {
		dialogElement.showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="item-creator-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	onclose={onDismiss}
>
	<div class="creator" data-dialog-scroll-area>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">New itinerary item</p>
				<h2 id="item-creator-heading">
					{creatorState === 'review'
						? 'Review imported items'
						: creatorState.startsWith('transport-')
							? 'Add transport'
							: 'Add an item'}
				</h2>
			</div>
			<form method="dialog"><button type="submit">Close</button></form>
		</header>

		{#if creatorState === 'review'}
			<p class="intro">Choose an item to review and complete before saving.</p>
			<ul>
				{#each importedItems as item, index (index)}
					<li>
						<div>
							<strong>{item.title}</strong>
							<span>{importedItemDescription(item)}</span>
							{#if item.suggestedStartDate}
								<small>Suggested date: {item.suggestedStartDate}; confirm the time.</small>
							{:else}
								<small>Confirm the schedule before saving.</small>
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
			<p class="wizard-progress">
				Step {endpointKind === 'departure' ? '1' : '2'} of 4 · {endpointLabel(endpointKind)}
			</p>
			<p class="intro">
				Where does this journey {endpointKind === 'departure' ? 'start' : 'end'}? A place, airport, station, stop, or
				address is enough.
			</p>
			<form class="shiori-form" onsubmit={(event) => moveToTransportEndpoint(event, endpointKind)}>
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
						Google Maps link <span class="field-hint">Optional; we’ll fill in what we can.</span>
						<input
							class="shiori-form-control"
							bind:value={endpointDraft.googleMapsUrl}
							inputmode="url"
							placeholder="Paste a Google Maps link"
						/>
					</label>
					<button
						class="shiori-form-button"
						disabled={resolvingEndpoint !== null}
						onclick={() => void resolveTransportEndpoint(endpointKind)}
						type="button"
					>
						{resolvingEndpoint === endpointKind ? 'Looking up…' : 'Look up link'}
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
			<p class="intro">Add only the details that help identify this trip. You’ll set its precise schedule next.</p>
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
					<p class="schedule-found">The scheduled times from AeroDataBox will be kept for the final review.</p>
				{:else}
					<label class="shiori-form-label">
						Departure date <span class="field-hint">Optional; used to prefill the schedule.</span>
						<input class="shiori-form-control" bind:value={suggestedStartDate} type="date" />
					</label>
				{/if}
				<label class="shiori-form-label">
					Journey title <span class="field-hint">Optional; a route title is generated otherwise.</span>
					<input class="shiori-form-control" bind:value={transportTitle} placeholder="Travel: Melbourne → Tokyo" />
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
					? 'AeroDataBox found a route-matched scheduled flight. Confirm it before saving.'
					: 'Confirm the journey. The next screen will ask for the departure time before you save it.'}
			</p>
			<section class="journey-summary" aria-label="Transport journey summary">
				<strong>{journeyPreview()}</strong>
				<p>{departure.name} <span aria-hidden="true">→</span> {arrival.name}</p>
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
		{:else}
			<p class="intro">
				Paste a Google Maps place or directions link, or a Google Flights link. We’ll prefill what we can, then you can
				review it.
			</p>
			<form class="shiori-form" onsubmit={importUrl}>
				<label class="shiori-form-label">
					Google link
					<input
						class="shiori-form-control"
						bind:value={url}
						inputmode="url"
						placeholder="Paste a Google Maps or Google Flights link"
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

	.journey-summary p {
		color: var(--color-text-secondary);
		margin: 0;
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
