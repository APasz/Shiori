<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ItineraryExporter from '$lib/components/ItineraryExporter.svelte';
	import ItineraryItemDetails from '$lib/components/ItineraryItemDetails.svelte';
	import ItineraryItemCreator from '$lib/components/ItineraryItemCreator.svelte';
	import ItineraryItemEditor from '$lib/components/ItineraryItemEditor.svelte';
	import ItineraryItemIllustration from '$lib/components/ItineraryItemIllustration.svelte';
	import ItineraryNowNext from '$lib/components/ItineraryNowNext.svelte';
	import ItineraryTime from '$lib/components/ItineraryTime.svelte';
	import ItineraryTiming from '$lib/components/ItineraryTiming.svelte';
	import TripEditor from '$lib/components/TripEditor.svelte';
	import TripSwitcher from '$lib/components/TripSwitcher.svelte';
	import { apiErrorSchema, editSaveResponseSchema, type ItineraryItemImport } from '$lib/editing/contracts';
	import { addCalendarDays, calendarMonthForDate } from '$lib/itinerary/calendar';
	import { createEmptyItineraryItem, createItineraryItemFromImport } from '$lib/itinerary/draft';
	import type { PublicItineraryItem } from '$lib/itinerary/access';
	import { createTransportJourneyItem, type TransportJourneyDraft } from '$lib/itinerary/transport-journey';
	import {
		defaultItemTimestamp,
		formatLocalDay,
		getItineraryDateRange,
		getLocalItineraryDays,
		partitionDayItems,
		type DayTimelineEntry
	} from '$lib/itinerary/presentation';
	import type { ItineraryItem, ItineraryItemType } from '$lib/itinerary/schema';
	import { formatTimestampInTimeZone } from '$lib/itinerary/time';
	import { resolveTimingTimeZone } from '$lib/itinerary/time-zone';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { clearOfflineTripPages, refreshOfflineTripPage } from '$lib/offline';
	import type { AuthenticatedUser, DetailedTripView, TripSwitchOption, TripView } from '$lib/server/store';
	import { itemTypeAccentStyle } from '$lib/theme/palette';
	import { onMount } from 'svelte';

	type TripPageData = {
		currentUser: AuthenticatedUser | null;
		setupRequired: boolean;
		trip: TripView;
		trips: TripSwitchOption[];
	};
	type ConnectivityStatus = 'checking' | 'reachable' | 'unreachable';

	const connectionProbeIntervalMilliseconds = 30_000;
	const connectionProbeTimeoutMilliseconds = 5_000;
	const connectionProbeEndpoint = resolve('/api/health');

	let { data }: { data: TripPageData } = $props();
	let selectedItemId = $state<string | null>(null);
	type EditingItem = {
		item: ItineraryItem;
		mode: 'create' | 'edit';
		suggestedEndDate?: string;
		suggestedStartDate?: string;
		timingNeedsConfirmation: boolean;
	};

	let editingItem = $state<EditingItem | null>(null);
	let creatingItem = $state(false);
	let exportingItinerary = $state(false);
	let itemCreationLocalDay = $state<string | undefined>(undefined);
	let editingTripMode = $state<'create' | 'edit' | null>(null);
	let switchingTrips = $state(false);
	let tripOverflowOpen = $state(false);
	let mutationError = $state<string | null>(null);
	let pendingMutationItemId = $state<string | null>(null);
	let localScheduleReady = $state(false);
	let dayDisclosureReady = $state(false);
	let openDayDates = $state<string[]>([]);
	let appliedViewerRevision = $state(0);
	let connectivityStatus = $state<ConnectivityStatus>('checking');
	let connectionProbeController: AbortController | null = null;

	const itemTypeLabels: Record<ItineraryItem['type'], string> = {
		transport: 'Transport',
		activity: 'Activity',
		accommodation: 'Accommodation'
	};

	const detailedTrip = $derived(getDetailedTrip(data.trip));
	const canModifyItinerary = $derived(detailedTrip?.canEdit === true && connectivityStatus === 'reachable');
	const itinerary = $derived(data.trip.itinerary);
	const localDays = $derived(localScheduleReady ? getLocalItineraryDays(itinerary.items, viewerContext.timeZone) : []);
	const dateRange = $derived(
		localScheduleReady ? getItineraryDateRange(itinerary.items, viewerContext.timeZone) : null
	);

	type DayItem = ItineraryItem | PublicItineraryItem;

	function getDetailedTrip(trip: TripView): DetailedTripView | null {
		return trip.access === 'visitor' ? null : trip;
	}

	function dayDisclosureStorageKey(): string {
		return `shiori:open-day-cards:${data.trip.id}`;
	}

	function beginItemCreation(localDay?: string): void {
		if (!canModifyItinerary) {
			return;
		}

		mutationError = null;
		itemCreationLocalDay = localDay;
		creatingItem = true;
	}

	function beginCreatingItem(type: ItineraryItemType): void {
		if (!canModifyItinerary) {
			return;
		}

		mutationError = null;
		editingItem = {
			item: createEmptyItineraryItem(
				type,
				crypto.randomUUID(),
				defaultItemTimestamp(itemCreationLocalDay, viewerContext.timeZone, viewerContext.currentTimestamp)
			),
			mode: 'create',
			timingNeedsConfirmation: false
		};
	}

	function beginImportedItem(itemImport: ItineraryItemImport): void {
		if (!canModifyItinerary) {
			return;
		}

		const suggestedStartDate = itemImport.suggestedStartDate ?? itemCreationLocalDay;
		mutationError = null;
		editingItem = {
			item: createItineraryItemFromImport(
				itemImport,
				crypto.randomUUID(),
				defaultItemTimestamp(suggestedStartDate, viewerContext.timeZone, viewerContext.currentTimestamp)
			),
			mode: 'create',
			...(itemImport.suggestedEndDate ? { suggestedEndDate: itemImport.suggestedEndDate } : {}),
			...(suggestedStartDate ? { suggestedStartDate } : {}),
			timingNeedsConfirmation: true
		};
	}

	function beginTransportJourney(journey: TransportJourneyDraft): void {
		if (!canModifyItinerary) {
			return;
		}

		const journeyDate = journey.suggestedStartDate ?? itemCreationLocalDay;
		mutationError = null;
		editingItem = {
			item: createTransportJourneyItem(
				journey,
				crypto.randomUUID(),
				defaultItemTimestamp(journeyDate, viewerContext.timeZone, viewerContext.currentTimestamp)
			),
			mode: 'create',
			...(journeyDate ? { suggestedStartDate: journeyDate } : {}),
			timingNeedsConfirmation: journey.schedule === undefined
		};
	}

	function defaultOpenDayDates(): string[] {
		const currentDate = formatTimestampInTimeZone(viewerContext.currentTimestamp, viewerContext.timeZone)?.date;
		const followingDate = currentDate ? addCalendarDays(currentDate, 1) : null;
		return localDays.filter((day) => day.date === currentDate || day.date === followingDate).map((day) => day.date);
	}

	function restoredOpenDayDates(): string[] | null {
		try {
			const stored = sessionStorage.getItem(dayDisclosureStorageKey());
			if (stored === null) {
				return null;
			}
			const parsed: unknown = JSON.parse(stored);
			return Array.isArray(parsed) &&
				parsed.every((date) => typeof date === 'string' && calendarMonthForDate(date) !== null)
				? [...new Set(parsed)]
				: null;
		} catch {
			return null;
		}
	}

	function saveOpenDayDates(): void {
		try {
			sessionStorage.setItem(dayDisclosureStorageKey(), JSON.stringify(openDayDates));
		} catch {
			// Day-card state is an optional browser convenience.
		}
	}

	function isDayOpen(date: string): boolean {
		return openDayDates.includes(date);
	}

	function changeDayDisclosure(date: string, event: Event): void {
		if (!dayDisclosureReady) {
			return;
		}
		const target = event.currentTarget;
		if (!(target instanceof HTMLDetailsElement)) {
			return;
		}
		openDayDates = target.open
			? [...new Set([...openDayDates, date])]
			: openDayDates.filter((openDate) => openDate !== date);
		saveOpenDayDates();
	}

	function toggleAllDayDisclosures(): void {
		const dayDates = localDays.map((day) => day.date);
		const allDaysAreOpen = dayDates.every((date) => isDayOpen(date));
		openDayDates = allDaysAreOpen ? [] : dayDates;
		saveOpenDayDates();
	}

	$effect(() => {
		const revision = viewerContext.revision;
		if (!dayDisclosureReady || revision === 0 || revision === appliedViewerRevision) {
			return;
		}
		openDayDates = defaultOpenDayDates();
		appliedViewerRevision = revision;
		saveOpenDayDates();
	});

	function beginEditingItem(item: ItineraryItem): void {
		if (!canModifyItinerary) {
			return;
		}

		mutationError = null;
		editingItem = { item, mode: 'edit', timingNeedsConfirmation: false };
	}

	function beginEditingTrip(mode: 'create' | 'edit'): void {
		if (!canModifyItinerary) {
			return;
		}

		tripOverflowOpen = false;
		editingTripMode = mode;
	}

	function beginSwitchingTrips(): void {
		tripOverflowOpen = false;
		switchingTrips = true;
	}

	function itemsEndpoint(): string | null {
		return detailedTrip ? `/api/trips/${encodeURIComponent(detailedTrip.id)}/items` : null;
	}

	function mutationMessage(responseData: unknown, fallback: string): string {
		const parsed = apiErrorSchema.safeParse(responseData);
		return parsed.success ? parsed.data.message : fallback;
	}

	async function deleteItem(item: ItineraryItem): Promise<void> {
		const endpoint = itemsEndpoint();
		if (!canModifyItinerary || !endpoint || !detailedTrip || !window.confirm(`Delete “${item.title}”?`)) {
			return;
		}

		pendingMutationItemId = item.id;
		mutationError = null;
		try {
			const response = await fetch(endpoint, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'delete', itemId: item.id, revision: detailedTrip.revision })
			});
			const responseData: unknown = await response.json().catch(() => null);
			if (!response.ok || !editSaveResponseSchema.safeParse(responseData).success) {
				mutationError = mutationMessage(responseData, 'The itinerary item could not be deleted.');
				return;
			}
			if (selectedItemId === item.id) {
				selectedItemId = null;
			}
			await invalidateAll();
			refreshOfflineTripPage();
		} catch {
			mutationError = 'The itinerary item could not be deleted because the server is unavailable.';
		} finally {
			pendingMutationItemId = null;
		}
	}

	async function finishEditing(): Promise<void> {
		editingItem = null;
		await invalidateAll();
		refreshOfflineTripPage();
	}

	async function finishAccommodationCreation(): Promise<void> {
		creatingItem = false;
		await invalidateAll();
		refreshOfflineTripPage();
	}

	async function finishTripEditing(): Promise<void> {
		editingTripMode = null;
		await invalidateAll();
		refreshOfflineTripPage();
	}

	async function visitCreatedTrip(slug: string): Promise<void> {
		editingTripMode = null;
		await goto(resolve('/trips/[slug]', { slug }));
	}

	function markConnectionUnavailable(): void {
		connectionProbeController?.abort();
		connectionProbeController = null;
		connectivityStatus = 'unreachable';
	}

	async function checkShioriConnection(): Promise<void> {
		connectionProbeController?.abort();
		const controller = new AbortController();
		connectionProbeController = controller;
		const timeoutId = window.setTimeout(() => controller.abort(), connectionProbeTimeoutMilliseconds);

		try {
			const response = await fetch(connectionProbeEndpoint, {
				cache: 'no-store',
				headers: { 'cache-control': 'no-store' },
				signal: controller.signal
			});
			if (connectionProbeController === controller) {
				connectivityStatus = response.ok ? 'reachable' : 'unreachable';
			}
		} catch {
			if (connectionProbeController === controller) {
				connectivityStatus = 'unreachable';
			}
		} finally {
			window.clearTimeout(timeoutId);
			if (connectionProbeController === controller) {
				connectionProbeController = null;
			}
		}
	}

	$effect(() => {
		if (connectivityStatus === 'reachable') {
			return;
		}

		editingItem = null;
		creatingItem = false;
		editingTripMode = null;
	});

	onMount(() => {
		const checkConnection = (): void => {
			void checkShioriConnection();
		};
		if (navigator.onLine) {
			checkConnection();
		} else {
			markConnectionUnavailable();
		}
		window.addEventListener('online', checkConnection);
		window.addEventListener('offline', markConnectionUnavailable);
		const probeIntervalId = window.setInterval(checkConnection, connectionProbeIntervalMilliseconds);
		appliedViewerRevision = viewerContext.revision;
		localScheduleReady = true;
		queueMicrotask(() => {
			openDayDates = restoredOpenDayDates() ?? defaultOpenDayDates();
			dayDisclosureReady = true;
		});

		return () => {
			connectionProbeController?.abort();
			connectionProbeController = null;
			window.clearInterval(probeIntervalId);
			window.removeEventListener('online', checkConnection);
			window.removeEventListener('offline', markConnectionUnavailable);
		};
	});
</script>

{#snippet dayItem(item: DayItem, dayDate: string, display: 'stay' | 'timeline')}
	<li class={display === 'stay' ? 'stay-row' : 'item-row'}>
		{#if detailedTrip}
			<button
				type="button"
				class={display === 'stay' ? 'stay-button' : 'item-button'}
				class:selected={selectedItemId === item.id}
				aria-haspopup="dialog"
				aria-pressed={selectedItemId === item.id}
				onclick={() => (selectedItemId = item.id)}
				style={itemTypeAccentStyle(item.type)}
			>
				<ItineraryTiming
					day={dayDate}
					itemType={item.type}
					timing={item.timing}
					timeZone={resolveTimingTimeZone(item.timing, itinerary.timeZone)}
				/>
				{#if display === 'timeline'}
					<span class="item-type">{itemTypeLabels[item.type]}</span>
				{/if}
				<span class:item-title={display === 'timeline'} class:stay-title={display === 'stay'}>
					<span data-item-title-text>{item.title}</span>
				</span>
				{#if display === 'timeline'}
					<ItineraryItemIllustration {item} />
				{/if}
			</button>
		{:else}
			<div class={display === 'stay' ? 'stay-summary' : 'item-summary'} style={itemTypeAccentStyle(item.type)}>
				<ItineraryTiming
					day={dayDate}
					itemType={item.type}
					timing={item.timing}
					timeZone={resolveTimingTimeZone(item.timing, itinerary.timeZone)}
				/>
				{#if display === 'timeline'}
					<span class="item-type">{itemTypeLabels[item.type]}</span>
				{/if}
				<span class:item-title={display === 'timeline'} class:stay-title={display === 'stay'}>
					<span data-item-title-text>{item.title}</span>
				</span>
				{#if display === 'timeline'}
					<ItineraryItemIllustration {item} />
				{/if}
			</div>
		{/if}
	</li>
{/snippet}

{#snippet stayBoundaryItem(entry: Extract<DayTimelineEntry<DayItem>, { kind: 'stay-boundary' }>)}
	{@const boundaryLabel = entry.boundary === 'check-in' ? 'Check in' : 'Check out'}
	<li class="stay-boundary-row">
		{#if detailedTrip}
			<button
				aria-haspopup="dialog"
				aria-label={`${boundaryLabel}: ${entry.item.title}`}
				aria-pressed={selectedItemId === entry.item.id}
				class:selected={selectedItemId === entry.item.id}
				class="stay-boundary-button"
				onclick={() => (selectedItemId = entry.item.id)}
				style={itemTypeAccentStyle(entry.item.type)}
				type="button"
			>
				<ItineraryTime
					startAt={entry.timestamp}
					timeZone={resolveTimingTimeZone(entry.item.timing, itinerary.timeZone)}
				/>
				<span class="stay-boundary-label">{boundaryLabel}</span>
			</button>
		{:else}
			<div class="stay-boundary-summary" style={itemTypeAccentStyle(entry.item.type)}>
				<ItineraryTime
					startAt={entry.timestamp}
					timeZone={resolveTimingTimeZone(entry.item.timing, itinerary.timeZone)}
				/>
				<span class="stay-boundary-label">{boundaryLabel}</span>
			</div>
		{/if}
	</li>
{/snippet}

{#snippet timelineEntry(entry: DayTimelineEntry<DayItem>, dayDate: string)}
	{#if entry.kind === 'item'}
		{@render dayItem(entry.item, dayDate, 'timeline')}
	{:else}
		{@render stayBoundaryItem(entry)}
	{/if}
{/snippet}

{#snippet stayBlock(stays: DayItem[], dayDate: string, position: 'arriving' | 'ongoing')}
	<section
		aria-label={`${position === 'ongoing' ? 'Continuing stays' : 'Check-ins'} on ${formatLocalDay(dayDate)}`}
		class="stay-block"
	>
		<h4>{position === 'ongoing' ? 'Continuing stays' : 'Check-ins'}</h4>
		<ul class="stay-list">
			{#each stays as item (item.id)}
				{@render dayItem(item, dayDate, 'stay')}
			{/each}
		</ul>
	</section>
{/snippet}

<svelte:head>
	<title>Shiori · Travel itineraries</title>
	<meta name="description" content="A server-authoritative travel itinerary, validated by Shiori." />
</svelte:head>

<main>
	<header>
		{#if connectivityStatus === 'unreachable'}
			<p class="offline-status" role="status">
				Shiori is unreachable · showing the last saved itinerary. Changes require a connection.
			</p>
		{/if}
		<nav aria-label="Account">
			{#if data.trip.access === 'admin' || data.trip.access === 'sudo'}
				<a href={resolve('/trips/[slug]/costs', { slug: data.trip.slug })}>Costs</a>
			{/if}
			{#if data.currentUser}
				<span>Signed as {data.currentUser.username}</span>
				{#if data.trip.access === 'sudo' && canModifyItinerary}
					<a href={resolve(`/settings/access?trip=${encodeURIComponent(data.trip.slug)}`)}>Access</a>
				{/if}
				<form action="/logout" method="POST" onsubmit={clearOfflineTripPages}>
					<button type="submit">Sign out</button>
				</form>
			{:else if data.setupRequired}
				<a href={resolve('/setup')}>Set up Shiori</a>
			{:else}
				<a href={resolve('/login')}>Sign in</a>
			{/if}
			<button onclick={() => (exportingItinerary = true)} type="button">Export</button>
			{#if detailedTrip?.canEdit}
				<details bind:open={tripOverflowOpen} class="trip-overflow">
					<summary aria-label="Trip options" title="Trip options">•••</summary>
					<div class="trip-overflow-menu">
						<button onclick={beginSwitchingTrips} type="button">Switch trip</button>
						{#if canModifyItinerary}
							<button onclick={() => beginEditingTrip('create')} type="button">New trip</button>
							<button onclick={() => beginEditingTrip('edit')} type="button">Edit trip</button>
						{/if}
					</div>
				</details>
			{/if}
		</nav>
		<h1>{itinerary.title}</h1>
		<ItineraryNowNext items={itinerary.items} tripTimeZone={itinerary.timeZone} />
	</header>

	<div class="itinerary-content">
		<div class="itinerary-summary">
			{#if !localScheduleReady || !dayDisclosureReady}
				<p class="dates">Localizing itinerary…</p>
			{:else if dateRange}
				<p class="dates">
					{formatLocalDay(dateRange[0])} – {formatLocalDay(dateRange[1])}
				</p>
			{/if}

			{#if dayDisclosureReady && localDays.length > 0}
				{@const allDaysAreOpen = localDays.every((day) => isDayOpen(day.date))}
				<button class="day-disclosure-toggle" onclick={toggleAllDayDisclosures} type="button">
					{allDaysAreOpen ? 'Collapse all' : 'Expand all'}
				</button>
			{/if}
		</div>

		<section aria-labelledby="itinerary-heading">
			{#if !localScheduleReady || !dayDisclosureReady}
				<p class="detail-prompt">Localizing your schedule…</p>
			{:else if itinerary.items.length === 0}
				<p class="empty-day">No items planned yet.</p>
				{#if canModifyItinerary}
					<div class="add-item-actions" aria-label="Add an itinerary item">
						<button onclick={() => beginItemCreation()} type="button">Add item</button>
					</div>
				{/if}
			{:else}
				<div class="days">
					{#each localDays as day, index (day.date)}
						{@const dayItems = partitionDayItems(day.items, day.date, viewerContext.timeZone)}
						{@const { arrivingStays, ongoingStays, timelineEntries } = dayItems}
						<details class="day" open={isDayOpen(day.date)} ontoggle={(event) => changeDayDisclosure(day.date, event)}>
							<summary><h3>Day {index + 1}: {formatLocalDay(day.date)}</h3></summary>
							<div class="day-content">
								{#if ongoingStays.length > 0}
									{@render stayBlock(ongoingStays, day.date, 'ongoing')}
								{/if}
								{#if timelineEntries.length === 0 && ongoingStays.length === 0 && arrivingStays.length === 0}
									<p class="empty-day">No items planned for this day.</p>
								{:else if timelineEntries.length > 0}
									<ul>
										{#each timelineEntries as entry (`${entry.item.id}:${entry.kind}:${entry.timestamp}`)}
											{@render timelineEntry(entry, day.date)}
										{/each}
									</ul>
								{/if}
								{#if arrivingStays.length > 0}
									{@render stayBlock(arrivingStays, day.date, 'arriving')}
								{/if}
								{#if canModifyItinerary}
									<div class="add-item-actions" aria-label={`Add an item on ${formatLocalDay(day.date)}`}>
										<button onclick={() => beginItemCreation(day.date)} type="button"> Add item </button>
									</div>
								{/if}
							</div>
						</details>
					{/each}
				</div>
			{/if}

			{#if detailedTrip && selectedItemId !== null}
				{@const selectedItem = detailedTrip.itinerary.items.find((item) => item.id === selectedItemId)}
				{#if selectedItem}
					<ItineraryItemDetails
						expenses={detailedTrip.itinerary.expenses}
						item={selectedItem}
						localCurrency={detailedTrip.itinerary.localCurrency}
						tripTimeZone={itinerary.timeZone}
						canEdit={canModifyItinerary}
						deleteError={mutationError}
						isDeleting={pendingMutationItemId === selectedItem.id}
						onDelete={() => void deleteItem(selectedItem)}
						onDismiss={() => {
							mutationError = null;
							selectedItemId = null;
						}}
						onEdit={() => {
							beginEditingItem(selectedItem);
							selectedItemId = null;
						}}
					/>
				{/if}
			{/if}
		</section>
	</div>

	{#if detailedTrip && canModifyItinerary && editingItem}
		<ItineraryItemEditor
			expenses={detailedTrip.itinerary.expenses}
			item={editingItem.item}
			localCurrency={detailedTrip.itinerary.localCurrency}
			mode={editingItem.mode}
			tripTimeZone={itinerary.timeZone}
			tripId={detailedTrip.id}
			revision={detailedTrip.revision}
			suggestedEndDate={editingItem.suggestedEndDate}
			suggestedStartDate={editingItem.suggestedStartDate}
			timingNeedsConfirmation={editingItem.timingNeedsConfirmation}
			onDismiss={() => (editingItem = null)}
			onSaved={finishEditing}
		/>
	{/if}

	{#if detailedTrip && canModifyItinerary && creatingItem}
		<ItineraryItemCreator
			tripId={detailedTrip.id}
			tripTimeZone={itinerary.timeZone}
			localCurrency={detailedTrip.itinerary.localCurrency}
			initialDate={itemCreationLocalDay}
			revision={detailedTrip.revision}
			onDismiss={() => (creatingItem = false)}
			onAccommodationSaved={finishAccommodationCreation}
			onImported={beginImportedItem}
			onManual={beginCreatingItem}
			onTransportJourney={beginTransportJourney}
		/>
	{/if}

	{#if detailedTrip && canModifyItinerary && editingTripMode}
		<TripEditor
			mode={editingTripMode}
			trip={detailedTrip}
			onCreated={visitCreatedTrip}
			onDismiss={() => (editingTripMode = null)}
			onSaved={finishTripEditing}
		/>
	{/if}

	{#if detailedTrip && switchingTrips}
		<TripSwitcher currentSlug={detailedTrip.slug} onDismiss={() => (switchingTrips = false)} trips={data.trips} />
	{/if}

	{#if exportingItinerary}
		<ItineraryExporter {itinerary} onDismiss={() => (exportingItinerary = false)} />
	{/if}
</main>

<style>
	main {
		padding: clamp(0.75rem, 2vw, 1.5rem) 0 clamp(2rem, 5vw, 4rem);
	}

	header {
		border-bottom: 1px solid var(--color-border-default);
		padding: clamp(3rem, 5vw, 4rem) 1rem 0.75rem;
	}

	.offline-status {
		background: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border-default);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 1rem;
		text-align: center;
	}

	.itinerary-content {
		margin: 0 auto;
		width: min(100% - 2rem, 48rem);
	}

	nav {
		align-items: center;
		background: var(--color-surface-page);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.8125rem;
		gap: 0.375rem;
		justify-content: end;
		max-width: calc(100vw - 6.5rem);
		position: fixed;
		right: 5.75rem;
		top: 1rem;
		z-index: 1;
	}

	nav form {
		margin: 0;
	}

	.trip-overflow {
		position: relative;
	}

	.trip-overflow summary {
		align-items: center;
		background: transparent;
		border: 1px solid var(--color-border-default);
		cursor: pointer;
		display: flex;
		font-size: 1rem;
		height: 1.875rem;
		justify-content: center;
		letter-spacing: 0.1em;
		list-style: none;
		padding: 0 0.5rem 0 0.6rem;
	}

	.trip-overflow summary::-webkit-details-marker {
		display: none;
	}

	.trip-overflow summary:hover,
	.trip-overflow[open] summary {
		border-color: var(--color-border-strong);
	}

	.trip-overflow summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.trip-overflow-menu {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		display: grid;
		gap: 0.25rem;
		padding: 0.25rem;
		position: absolute;
		right: 0;
		top: calc(100% + 0.25rem);
		width: max-content;
		z-index: 2;
	}

	.trip-overflow-menu button {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.5rem 0.625rem;
		text-align: left;
	}

	.trip-overflow-menu button:hover {
		background: var(--color-surface-subtle);
	}

	.trip-overflow-menu button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: -2px;
	}

	nav a,
	nav button {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		font: inherit;
		padding: 0.25rem 0.5rem;
		text-decoration: none;
	}

	nav button,
	.add-item-actions button {
		cursor: pointer;
	}

	h1,
	h3,
	p {
		margin-top: 0;
	}

	h1 {
		font-size: clamp(2.25rem, 8vw, 4.5rem);
		letter-spacing: -0.045em;
		line-height: 1;
		margin-bottom: 0;
		text-align: center;
	}

	.dates {
		margin: 0.75rem 0 0;
	}

	.itinerary-summary {
		align-items: center;
		display: flex;
		gap: 0.75rem;
	}

	.itinerary-summary .dates {
		margin-bottom: 0;
	}

	.day-disclosure-toggle {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		margin-left: auto;
		padding: 0.25rem 0.5rem;
		white-space: nowrap;
	}

	.day-disclosure-toggle:hover {
		border-color: var(--color-border-strong);
	}

	.day-disclosure-toggle:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	section {
		margin-top: 1.25rem;
	}

	.days {
		display: grid;
		gap: 0.75rem;
	}

	.day {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-default);
	}

	.day summary {
		align-items: center;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		list-style: none;
		padding: 0.625rem 0.875rem;
	}

	.day summary::-webkit-details-marker {
		display: none;
	}

	.day summary::after {
		color: var(--color-text-muted);
		content: '+';
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1;
	}

	.day[open] summary {
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.day[open] summary::after {
		content: '−';
	}

	.day summary:hover {
		background: var(--color-surface-subtle);
	}

	.day summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.day summary h3 {
		margin: 0;
	}

	.day-content {
		padding: 0.75rem 0.875rem 0.875rem;
	}

	h3 {
		font-size: 1rem;
		margin-bottom: 1rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		padding: 0.5rem 0;
	}

	li + li {
		border-top: 1px solid var(--color-border-subtle);
	}

	.stay-block {
		border: 1px solid var(--color-border-default);
		border-left: 3px solid var(--color-item-type-accommodation);
		margin: 0 0 0.875rem;
	}

	.stay-block h4 {
		color: var(--color-item-type-accommodation);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		margin: 0;
		padding: 0.375rem 0.5rem;
		text-transform: uppercase;
	}

	.stay-row {
		padding: 0;
	}

	.stay-button,
	.stay-summary {
		align-items: start;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.5rem;
		grid-template-columns: minmax(0, 1fr) max-content;
		padding: 0.5rem;
		text-align: left;
		width: 100%;
	}

	.stay-button:hover {
		border-color: var(--item-accent);
	}

	.stay-button.selected {
		box-shadow: inset 3px 0 var(--color-state-selection);
	}

	.stay-button :global(.itinerary-timing),
	.stay-summary :global(.itinerary-timing) {
		grid-column: 2;
		grid-row: 1;
	}

	.stay-title {
		align-self: center;
		color: var(--color-text-primary);
		font-weight: 600;
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
	}

	.stay-boundary-row {
		padding: 0;
	}

	.stay-boundary-button,
	.stay-boundary-summary {
		align-items: center;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.75rem;
		grid-template-columns: minmax(7.5rem, max-content) minmax(0, 1fr);
		padding: 0.375rem 0.5rem;
		text-align: left;
		width: 100%;
	}

	.stay-boundary-button:hover {
		border-color: var(--item-accent);
	}

	.stay-boundary-button.selected {
		box-shadow: inset 3px 0 var(--color-state-selection);
	}

	.stay-boundary-button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.stay-boundary-label {
		color: var(--item-accent);
		font-size: 0.8125rem;
	}

	.item-button,
	.item-summary {
		align-items: center;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.25rem 0.75rem;
		grid-template-columns: minmax(7.5rem, max-content) 7rem minmax(0, 1fr);
		padding: 0.5rem;
		position: relative;
		text-align: left;
		width: 100%;
	}

	.item-button:hover {
		border-color: var(--item-accent);
	}

	.item-button:focus-visible,
	.stay-button:focus-visible,
	nav a:focus-visible,
	nav button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.item-button.selected {
		box-shadow: inset 3px 0 var(--color-state-selection);
	}

	.item-type {
		color: var(--item-accent);
		font-size: 0.6875rem;
		line-height: 1.8;
		position: relative;
		z-index: 1;
	}

	.item-title {
		position: relative;
		z-index: 1;
	}

	:global(.item-illustration-overlaps) {
		text-shadow:
			0 1px 2px var(--color-surface-raised),
			1px 0 2px var(--color-surface-raised),
			-1px 0 2px var(--color-surface-raised);
	}

	.item-row {
		display: grid;
		gap: 0.5rem;
	}

	.add-item-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.add-item-actions button {
		appearance: none;
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		font: inherit;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
	}

	.add-item-actions button:hover {
		border-color: var(--color-state-selection);
	}

	.add-item-actions button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.add-item-actions {
		border-top: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
	}

	.empty-day,
	.detail-prompt {
		color: var(--color-text-muted);
	}

	.empty-day {
		margin-bottom: 0;
	}

	.detail-prompt {
		margin: 1.5rem 0 0;
	}

	@media (max-width: 32rem) {
		nav {
			right: 4.75rem;
			top: 0.5rem;
		}

		.item-button,
		.item-summary {
			align-items: start;
			grid-template-columns: minmax(7.5rem, max-content) minmax(0, 1fr);
		}

		.item-type,
		.item-title {
			grid-column: 2;
		}
	}
</style>
