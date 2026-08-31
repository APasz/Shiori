<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { browserPages, browserTitle } from '$lib/browser-title';
	import ItineraryNoteEditor from '$lib/components/ItineraryNoteEditor.svelte';
	import ItineraryNoteView from '$lib/components/ItineraryNoteView.svelte';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { formatCalendarDate } from '$lib/itinerary/calendar';
	import { dayNoteDate } from '$lib/itinerary/note-presentation';
	import type { DayItineraryNote, ItineraryNote, ItineraryNoteEditorTarget } from '$lib/itinerary/schema';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { refreshOfflineTripPage } from '$lib/offline';
	import { ConnectivityMonitor } from '$lib/connectivity.svelte';
	import type { PageData } from './$types';

	type EditingNote = {
		note: ItineraryNote | undefined;
		target: ItineraryNoteEditorTarget;
	};
	type DayNoteForViewer = Readonly<{
		date: string;
		note: DayItineraryNote;
	}>;

	let { data }: { data: PageData } = $props();
	let editingNote = $state<EditingNote | null>(null);
	const connectivity = new ConnectivityMonitor();
	const canModifyNotes = $derived(data.trip.canEdit && connectivity.status === 'reachable');

	const notesEndpoint = $derived(resolve('/api/trips/[tripId]/notes', { tripId: data.trip.id }));
	const tripNote = $derived(data.trip.itinerary.notes.find((note) => note.kind === 'trip'));
	const dayNotes = $derived(
		data.trip.itinerary.notes
			.filter((note): note is DayItineraryNote => note.kind === 'day')
			.map((note): DayNoteForViewer => ({ date: dayNoteDate(note, viewerContext.timeZone), note }))
			.toSorted((left, right) => left.note.anchorAt - right.note.anchorAt || left.note.id.localeCompare(right.note.id))
	);

	function beginEditing(target: ItineraryNoteEditorTarget, note: ItineraryNote | undefined): void {
		if (!canModifyNotes) {
			return;
		}
		editingNote = { note, target };
	}

	async function finishEditing(): Promise<void> {
		editingNote = null;
		await invalidateAll();
		refreshOfflineTripPage();
	}

	onMount(() => connectivity.start());
</script>

<svelte:head>
	<title>{browserTitle(browserPages.notes, data.trip.itinerary.title)}</title>
	<meta name="description" content={`Planning notes for ${data.trip.itinerary.title}.`} />
</svelte:head>

<TripTopbar
	activePage="notes"
	canManageAccounts={data.canManageAccounts}
	currentUser={data.currentUser}
	isOffline={connectivity.status === 'unreachable'}
	trip={data.trip}
/>

<main>
	<header class="page-heading">
		<PageTitle eyebrow={data.trip.itinerary.title} title="Notes" />
	</header>

	<div class="content">
		<section aria-labelledby="trip-notes-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Trip-wide</p>
					<h2 id="trip-notes-heading">Trip notepad</h2>
				</div>
				{#if canModifyNotes}
					<button onclick={() => beginEditing({ kind: 'trip' }, tripNote)} type="button">
						{tripNote ? 'Edit trip note' : 'Add trip note'}
					</button>
				{/if}
			</div>
			{#if tripNote}
				<ItineraryNoteView
					defaultTimeZone={data.trip.itinerary.timeZone}
					heading="Trip note"
					note={tripNote}
					onEdit={canModifyNotes ? () => beginEditing({ kind: 'trip' }, tripNote) : undefined}
				/>
			{:else}
				<p class="empty-note">No trip-wide note yet</p>
			{/if}
		</section>

		<section aria-labelledby="day-notes-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Daily planning</p>
					<h2 id="day-notes-heading">Day notes</h2>
				</div>
			</div>
			{#if dayNotes.length === 0}
				<p class="empty-note">No day notes yet. Add one from the corresponding itinerary day</p>
			{:else}
				<div class="day-notes">
					{#each dayNotes as { date, note } (note.id)}
						<ItineraryNoteView
							defaultTimeZone={data.trip.itinerary.timeZone}
							heading={formatCalendarDate(
								date,
								'date-with-weekday',
								viewerContext.locale,
								viewerContext.formatPreferences.dateFormat
							) ?? date}
							{note}
							onEdit={canModifyNotes ? () => beginEditing({ date, kind: 'day' }, note) : undefined}
						/>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</main>

{#if editingNote}
	<ItineraryNoteEditor
		defaultTimeZone={data.trip.itinerary.timeZone}
		initialNote={editingNote.note}
		isServerReachable={connectivity.status === 'reachable'}
		localCurrency={data.trip.itinerary.localCurrency}
		{notesEndpoint}
		onDismiss={() => (editingNote = null)}
		onSaved={finishEditing}
		revision={data.trip.revision}
		target={editingNote.target}
	/>
{/if}

<style>
	main {
		padding-bottom: clamp(2rem, 5vw, 4rem);
	}

	.section-heading > button {
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	h2,
	p {
		margin-top: 0;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 0;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin-bottom: 0.375rem;
		text-transform: uppercase;
	}

	.content {
		margin: 0 auto;
		padding: 1.5rem 1rem;
		width: min(100%, 64rem);
	}

	section + section {
		margin-top: 2.5rem;
	}

	.section-heading {
		align-items: end;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.section-heading > button {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-state-selection);
		color: inherit;
		font: inherit;
		padding: 0.625rem 1rem;
	}

	.empty-note {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: 0;
	}

	.day-notes {
		display: grid;
		gap: 1rem;
	}
</style>
