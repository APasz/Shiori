<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ItineraryNoteEditor from '$lib/components/ItineraryNoteEditor.svelte';
	import ItineraryNoteView from '$lib/components/ItineraryNoteView.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { formatCalendarDate } from '$lib/itinerary/calendar';
	import type { ItineraryNote, ItineraryNoteTarget } from '$lib/itinerary/schema';
	import { refreshOfflineTripPage } from '$lib/offline';
	import type { PageData } from './$types';

	type EditingNote = {
		note: ItineraryNote | undefined;
		target: ItineraryNoteTarget;
	};

	let { data }: { data: PageData } = $props();
	let editingNote = $state<EditingNote | null>(null);

	const notesEndpoint = $derived(resolve('/api/trips/[tripId]/notes', { tripId: data.trip.id }));
	const tripNote = $derived(data.trip.itinerary.notes.find((note) => note.kind === 'trip'));
	const dayNotes = $derived(
		data.trip.itinerary.notes
			.filter((note): note is Extract<ItineraryNote, { kind: 'day' }> => note.kind === 'day')
			.toSorted((left, right) => left.date.localeCompare(right.date))
	);

	function beginEditing(target: ItineraryNoteTarget, note: ItineraryNote | undefined): void {
		if (!data.trip.canEdit) {
			return;
		}
		editingNote = { note, target };
	}

	async function finishEditing(): Promise<void> {
		editingNote = null;
		await invalidateAll();
		refreshOfflineTripPage();
	}
</script>

<svelte:head>
	<title>Notes · {data.trip.itinerary.title} · Shiori</title>
	<meta name="description" content={`Planning notes for ${data.trip.itinerary.title}.`} />
</svelte:head>

<TripTopbar activePage="notes" currentUser={data.currentUser} trip={data.trip} />

<main>
	<header>
		<p class="eyebrow">{data.trip.itinerary.title}</p>
		<h1>Notes</h1>
		<p class="introduction">
			Keep ideas, alternatives, and estimates separate from your confirmed itinerary and expenses.
		</p>
	</header>

	<div class="content">
		<section aria-labelledby="trip-notes-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Trip-wide</p>
					<h2 id="trip-notes-heading">Trip notepad</h2>
				</div>
				{#if data.trip.canEdit}
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
					onEdit={data.trip.canEdit ? () => beginEditing({ kind: 'trip' }, tripNote) : undefined}
				/>
			{:else}
				<p class="empty-note">No trip-wide note yet.</p>
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
				<p class="empty-note">No day notes yet. Add one from the corresponding itinerary day.</p>
			{:else}
				<div class="day-notes">
					{#each dayNotes as note (note.date)}
						<ItineraryNoteView
							defaultTimeZone={data.trip.itinerary.timeZone}
							heading={formatCalendarDate(note.date) ?? note.date}
							{note}
							onEdit={data.trip.canEdit ? () => beginEditing({ date: note.date, kind: 'day' }, note) : undefined}
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

	header {
		border-bottom: 1px solid var(--color-border-default);
		padding: clamp(2rem, 7vw, 5rem) 1rem 2rem;
		text-align: center;
	}

	.section-heading > button {
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	h1,
	h2,
	p {
		margin-top: 0;
	}

	h1 {
		font-size: clamp(2.75rem, 9vw, 5rem);
		letter-spacing: -0.05em;
		line-height: 1;
		margin-bottom: 0.75rem;
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

	.introduction {
		color: var(--color-text-secondary);
		margin: 0 auto;
		max-width: 42rem;
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
