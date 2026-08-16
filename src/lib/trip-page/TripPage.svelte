<script lang="ts">
	import { resolve } from '$app/paths';
	import ItineraryExporter from '$lib/components/ItineraryExporter.svelte';
	import ItineraryItemCreator from '$lib/components/ItineraryItemCreator.svelte';
	import ItineraryItemDetails from '$lib/components/ItineraryItemDetails.svelte';
	import ItineraryItemEditor from '$lib/components/ItineraryItemEditor.svelte';
	import ItineraryNoteEditor from '$lib/components/ItineraryNoteEditor.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import TripEditor from '$lib/components/TripEditor.svelte';
	import type { ItineraryItem, ItineraryNoteTarget } from '$lib/itinerary/schema';
	import { onMount } from 'svelte';
	import { ConnectivityMonitor } from './connectivity.svelte';
	import ItinerarySchedule from './ItinerarySchedule.svelte';
	import { ItineraryWorkflow } from './itinerary-workflow.svelte';
	import { refreshTripPage } from './refresh';
	import TripPageHeader from './TripPageHeader.svelte';
	import { detailedTripFor } from './trip';
	import type { EditingNote, TripPageData } from './types';

	let { data }: { data: TripPageData } = $props();
	let exportingItinerary = $state(false);
	let editingTrip = $state(false);
	let editingNote = $state<EditingNote | null>(null);
	const connectivity = new ConnectivityMonitor();
	const detailedTrip = $derived(detailedTripFor(data.trip));
	const canModifyItinerary = $derived(detailedTrip?.canEdit === true && connectivity.status === 'reachable');
	const itinerary = $derived(data.trip.itinerary);
	const notesEndpoint = $derived(resolve('/api/trips/[tripId]/notes', { tripId: data.trip.id }));
	const tripBackupTripId = $derived(canModifyItinerary ? data.trip.id : undefined);
	const itemWorkflow = new ItineraryWorkflow({
		canModify: () => canModifyItinerary,
		detailedTrip: () => detailedTrip
	});

	function beginEditingDayNote(date: string): void {
		if (!canModifyItinerary || !detailedTrip) {
			return;
		}
		const target: ItineraryNoteTarget = { date, kind: 'day' };
		editingNote = {
			note: detailedTrip.itinerary.notes.find((note) => note.kind === 'day' && note.date === date),
			target
		};
	}

	function beginEditingTrip(): void {
		if (canModifyItinerary) {
			editingTrip = true;
		}
	}

	function editSelectedItem(item: ItineraryItem): void {
		itemWorkflow.beginEditing(item);
		itemWorkflow.selectedItemId = null;
	}

	async function finishNoteEditing(): Promise<void> {
		editingNote = null;
		await refreshTripPage();
	}

	async function finishTripEditing(): Promise<void> {
		editingTrip = false;
		await refreshTripPage();
	}

	$effect(() => {
		if (connectivity.status === 'reachable') {
			return;
		}
		itemWorkflow.dismissForLostConnection();
		editingTrip = false;
	});

	onMount(() => connectivity.start());
</script>

<svelte:head>
	<title>Shiori · Travel itineraries</title>
	<meta name="description" content="A server-authoritative travel itinerary, validated by Shiori." />
</svelte:head>

<TripTopbar
	activePage="itinerary"
	canManageAccounts={data.canManageAccounts}
	{canModifyItinerary}
	currentUser={data.currentUser}
	isOffline={connectivity.status === 'unreachable'}
	backupTripId={tripBackupTripId}
	onEditTrip={beginEditingTrip}
	onExport={() => (exportingItinerary = true)}
	trip={data.trip}
/>

<main>
	<TripPageHeader {data} connectivityStatus={connectivity.status} />

	<ItinerarySchedule
		tripId={data.trip.id}
		{itinerary}
		{canModifyItinerary}
		canSelectItems={detailedTrip !== null}
		selectedItemId={itemWorkflow.selectedItemId}
		onSelectItem={(itemId) => (itemWorkflow.selectedItemId = itemId)}
		onCreateItem={(localDay) => itemWorkflow.beginCreation(localDay)}
		onEditDayNote={beginEditingDayNote}
	/>

	{#if detailedTrip && itemWorkflow.selectedItemId !== null}
		{@const selectedItem = detailedTrip.itinerary.items.find((item) => item.id === itemWorkflow.selectedItemId)}
		{#if selectedItem}
			<ItineraryItemDetails
				expenses={detailedTrip.itinerary.expenses}
				item={selectedItem}
				localCurrency={detailedTrip.itinerary.localCurrency}
				tripTimeZone={itinerary.timeZone}
				canEdit={canModifyItinerary}
				deleteError={itemWorkflow.mutationError}
				isDeleting={itemWorkflow.pendingMutationItemId === selectedItem.id}
				onDelete={() => void itemWorkflow.delete(selectedItem)}
				onDismiss={() => itemWorkflow.dismissDetails()}
				onEdit={() => editSelectedItem(selectedItem)}
			/>
		{/if}
	{/if}

	{#if detailedTrip && canModifyItinerary && itemWorkflow.editingItem}
		<ItineraryItemEditor
			expenses={detailedTrip.itinerary.expenses}
			item={itemWorkflow.editingItem.item}
			localCurrency={detailedTrip.itinerary.localCurrency}
			mode={itemWorkflow.editingItem.mode}
			tripTimeZone={itinerary.timeZone}
			tripId={detailedTrip.id}
			revision={detailedTrip.revision}
			suggestedEndDate={itemWorkflow.editingItem.suggestedEndDate}
			suggestedStartDate={itemWorkflow.editingItem.suggestedStartDate}
			timingNeedsConfirmation={itemWorkflow.editingItem.timingNeedsConfirmation}
			onDismiss={() => itemWorkflow.dismissEditor()}
			onSaved={() => itemWorkflow.finishEditing()}
		/>
	{/if}

	{#if detailedTrip && canModifyItinerary && itemWorkflow.creatingItem}
		<ItineraryItemCreator
			tripId={detailedTrip.id}
			tripTimeZone={itinerary.timeZone}
			localCurrency={detailedTrip.itinerary.localCurrency}
			initialDate={itemWorkflow.itemCreationLocalDay}
			revision={detailedTrip.revision}
			onDismiss={() => itemWorkflow.dismissCreator()}
			onAccommodationSaved={() => itemWorkflow.finishAccommodationCreation()}
			onImported={(itemImport) => itemWorkflow.beginImportedCreation(itemImport)}
			onManual={(type) => itemWorkflow.beginManualCreation(type)}
			onTransportJourney={(journey) => itemWorkflow.beginTransportJourney(journey)}
		/>
	{/if}

	{#if detailedTrip && canModifyItinerary && editingNote}
		<ItineraryNoteEditor
			defaultTimeZone={detailedTrip.itinerary.timeZone}
			initialNote={editingNote.note}
			localCurrency={detailedTrip.itinerary.localCurrency}
			{notesEndpoint}
			onDismiss={() => (editingNote = null)}
			onSaved={finishNoteEditing}
			revision={detailedTrip.revision}
			target={editingNote.target}
		/>
	{/if}

	{#if detailedTrip && canModifyItinerary && editingTrip}
		<TripEditor
			mode="edit"
			trip={detailedTrip}
			onDismiss={() => (editingTrip = false)}
			onCompleted={finishTripEditing}
		/>
	{/if}

	{#if exportingItinerary}
		<ItineraryExporter {itinerary} onDismiss={() => (exportingItinerary = false)} />
	{/if}
</main>

<style>
	main {
		padding: clamp(0.75rem, 2vw, 1.5rem) 0 clamp(2rem, 5vw, 4rem);
	}
</style>
