<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import { deleteItineraryNote, saveItineraryNote } from '$lib/editing/itinerary-note-client';
	import {
		currencyCodeSchema,
		noteEntryStateSchema,
		type CurrencyCode,
		type ItineraryNote,
		type ItineraryNoteTarget
	} from '$lib/itinerary/schema';
	import {
		emptyNoteEntryDraft,
		itineraryNoteDraft,
		itineraryNoteDraftFingerprint,
		validateItineraryNoteDraft,
		type ItineraryNoteDraft
	} from '$lib/itinerary/note-draft';
	import {
		itineraryNoteTargetDescription,
		itineraryNoteTargetLabel,
		itineraryNoteTargetTitle
	} from '$lib/itinerary/note-presentation';
	import { browserTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { brandIconFeedback } from '$lib/visuals/brand-feedback.svelte';
	import ItineraryNoteEntryEditor from './ItineraryNoteEntryEditor.svelte';
	import TimeZonePicker from './TimeZonePicker.svelte';

	type EditorState = 'editing' | 'saving' | 'deleting';

	let {
		defaultTimeZone,
		initialNote,
		localCurrency,
		notesEndpoint,
		onDismiss,
		onSaved,
		revision,
		target
	}: {
		defaultTimeZone: string;
		initialNote: ItineraryNote | undefined;
		localCurrency: CurrencyCode;
		notesEndpoint: string;
		onDismiss: () => void;
		onSaved: () => Promise<void>;
		revision: number;
		target: ItineraryNoteTarget;
	} = $props();

	let dialogElement: HTMLDialogElement;
	let draft = $state<ItineraryNoteDraft>(itineraryNoteDraft(undefined, 'UTC'));
	let timeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	let editorState = $state<EditorState>('editing');
	let errorMessage = $state('');
	let initialDraftFingerprint = $state<string | null>(null);

	const stateOptions = noteEntryStateSchema.options;
	const currencyOptions = currencyCodeSchema.options;
	const targetTitle = $derived(
		itineraryNoteTargetTitle(target, viewerContext.locale, viewerContext.formatPreferences.dateFormat)
	);
	const targetDescription = $derived(itineraryNoteTargetDescription(target));
	const targetLabel = $derived(itineraryNoteTargetLabel(target));
	const draftFingerprint = $derived(itineraryNoteDraftFingerprint(draft));
	const hasUnsavedChanges = $derived(initialDraftFingerprint !== null && draftFingerprint !== initialDraftFingerprint);

	function addEntry(): void {
		draft.entries = [...draft.entries, emptyNoteEntryDraft(crypto.randomUUID())];
	}

	function removeEntry(entryId: string): void {
		draft.entries = draft.entries.filter((entry) => entry.id !== entryId);
	}

	function confirmDiscard(): boolean {
		return !hasUnsavedChanges || window.confirm('Discard your unsaved note changes?');
	}

	function cancelEditing(): void {
		if (confirmDiscard()) {
			dialogElement.close();
		}
	}

	function handleDialogCancel(event: Event): void {
		if (!confirmDiscard()) {
			event.preventDefault();
		}
	}

	async function saveNote(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (editorState !== 'editing') {
			return;
		}

		errorMessage = '';
		const validation = validateItineraryNoteDraft(draft, target);
		if (!validation.valid) {
			errorMessage = validation.error;
			return;
		}

		editorState = 'saving';
		try {
			const result = await saveItineraryNote({ endpoint: notesEndpoint, note: validation.note, revision });
			if (!result.success) {
				editorState = 'editing';
				errorMessage = result.error;
				return;
			}
			brandIconFeedback.publish('success');
			await onSaved();
			dialogElement.close();
		} catch {
			editorState = 'editing';
			errorMessage = 'The note could not be saved because the server is unavailable.';
		}
	}

	async function deleteNote(): Promise<void> {
		if (!initialNote || editorState !== 'editing' || !window.confirm(`Delete ${targetTitle}?`)) {
			return;
		}

		editorState = 'deleting';
		errorMessage = '';
		try {
			const result = await deleteItineraryNote({ endpoint: notesEndpoint, revision, target });
			if (!result.success) {
				editorState = 'editing';
				errorMessage = result.error;
				return;
			}
			brandIconFeedback.publish('success');
			await onSaved();
			dialogElement.close();
		} catch {
			editorState = 'editing';
			errorMessage = 'The note could not be deleted because the server is unavailable.';
		}
	}

	onMount(() => {
		timeZoneOptions = browserTimeZoneOptions();
		draft = itineraryNoteDraft(initialNote, defaultTimeZone);
		initialDraftFingerprint = itineraryNoteDraftFingerprint(draft);
		dialogElement.showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="note-editor-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	oncancel={handleDialogCancel}
	onclose={onDismiss}
>
	<form class="editor shiori-form" data-dialog-scroll-area onsubmit={saveNote}>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">{targetLabel}</p>
				<h2 id="note-editor-heading">{targetTitle}</h2>
				<p
					class:changed={hasUnsavedChanges}
					class="editor-status"
					data-brand-feedback={editorState === 'editing' ? undefined : 'loading'}
				>
					{editorState === 'saving'
						? 'Saving changes…'
						: editorState === 'deleting'
							? 'Deleting note…'
							: hasUnsavedChanges
								? 'Unsaved changes'
								: 'All changes saved'}
				</p>
			</div>
			<div class="editor-actions">
				<button class="save-button shiori-form-button" disabled={editorState !== 'editing'} type="submit">
					{editorState === 'saving' ? 'Saving…' : 'Save note'}
				</button>
				<button
					class="close-button shiori-form-button"
					disabled={editorState !== 'editing'}
					onclick={cancelEditing}
					type="button"
				>
					Cancel
				</button>
			</div>
		</header>

		<p class="introduction">{targetDescription}</p>

		<label class="shiori-form-label">
			Freeform notes
			<textarea bind:value={draft.text} class="shiori-form-control" disabled={editorState !== 'editing'} rows="6"
			></textarea>
		</label>
		<label class="shiori-form-label" for="note-time-zone">
			Note time zone
			<span class="field-hint">Entry times use this time zone. It starts with the trip’s time zone.</span>
			<TimeZonePicker
				id="note-time-zone"
				onSelect={(value) => (draft.timeZone = value)}
				options={timeZoneOptions}
				value={draft.timeZone}
			/>
		</label>

		<section aria-labelledby="note-entries-heading" class="entries">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Planning list</p>
					<h3 id="note-entries-heading">Structured entries</h3>
				</div>
				<button
					class="add-entry shiori-form-button"
					disabled={editorState !== 'editing'}
					onclick={addEntry}
					type="button"
				>
					Add entry
				</button>
			</div>
			<p class="field-hint">Only populated fields appear when the note is viewed.</p>
			{#if draft.entries.length === 0}
				<p class="empty-entries">No structured entries yet.</p>
			{:else}
				<div class="entry-list">
					{#each draft.entries as entry, entryIndex (entry.id)}
						<ItineraryNoteEntryEditor
							bind:entry={draft.entries[entryIndex]}
							{currencyOptions}
							disabled={editorState !== 'editing'}
							entryNumber={entryIndex + 1}
							{localCurrency}
							onRemove={() => removeEntry(entry.id)}
							{stateOptions}
						/>
					{/each}
				</div>
			{/if}
		</section>

		{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
		{#if initialNote}
			<button class="delete-note" disabled={editorState !== 'editing'} onclick={() => void deleteNote()} type="button"
				>Delete note</button
			>
		{/if}
	</form>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-width: min(52rem, calc(100% - 2rem));
		overflow: visible;
		padding: 0;
		width: 100%;
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 88%, transparent);
	}

	.editor {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		max-height: min(50rem, calc(100vh - 2rem));
		overflow-y: auto;
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	header,
	.editor-actions,
	.section-heading {
		display: flex;
		gap: 1rem;
	}

	header,
	.section-heading {
		align-items: start;
		justify-content: space-between;
	}

	.editor-actions {
		align-items: center;
		flex-shrink: 0;
	}

	.eyebrow,
	.editor-status,
	.field-hint,
	.introduction,
	.empty-entries {
		color: var(--color-text-muted);
	}

	.eyebrow {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 0 0 0.25rem;
		text-transform: uppercase;
	}

	.editor-status,
	.field-hint,
	.introduction,
	.empty-entries {
		font-size: 0.875rem;
	}

	.editor-status,
	.introduction,
	.empty-entries {
		margin: 0.5rem 0 0;
	}

	.editor-status.changed {
		color: var(--color-state-warning);
	}

	h2,
	h3 {
		margin: 0;
	}

	h2 {
		font-size: 1.25rem;
	}

	h3 {
		font-size: 1rem;
	}

	.save-button {
		background: var(--color-surface-subtle);
	}

	.close-button {
		border-color: var(--color-border-strong);
	}

	.entries {
		border-top: 1px solid var(--color-border-default);
		padding-top: 1rem;
	}

	.add-entry {
		padding-block: 0.5rem;
	}

	.entry-list {
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
	}

	.delete-note {
		background: transparent;
		border: 1px solid var(--color-state-error);
		color: var(--color-state-error);
		cursor: pointer;
		font: inherit;
		margin-top: 0.5rem;
		padding: 0.375rem 0.625rem;
	}

	.error {
		color: var(--color-state-error);
		margin: 0;
	}

	button:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 38rem) {
		header,
		.section-heading {
			align-items: stretch;
			flex-direction: column;
		}

		.editor-actions {
			justify-content: end;
		}
	}
</style>
