<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import { apiErrorSchema, editSaveResponseSchema, tripCreateResponseSchema } from '$lib/editing/contracts';
	import { currencyCodeSchema, tripDetailsSchema, type CurrencyCode, type TripDetails } from '$lib/itinerary/schema';
	import { browserTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { isValidIanaTimeZone } from '$lib/itinerary/zoned-time';
	import type { DetailedTripView } from '$lib/server/store';
	import { formatValidationIssues } from '$lib/validation';
	import TimeZonePicker from './TimeZonePicker.svelte';

	type EditorMode = 'create' | 'edit';
	type EditorState = 'editing' | 'saving';
	type TripDetailsValidation =
		{ readonly details: TripDetails; readonly valid: true } | { readonly error: string; readonly valid: false };

	let {
		mode,
		trip,
		onDismiss,
		onCreated,
		onSaved
	}: {
		mode: EditorMode;
		trip: DetailedTripView;
		onDismiss: () => void;
		onCreated: (slug: string) => Promise<void>;
		onSaved: () => Promise<void>;
	} = $props();

	let dialogElement: HTMLDialogElement;
	let title = $state('');
	let timeZone = $state('UTC');
	let localCurrency = $state<CurrencyCode>('AUD');
	let timeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	let editorState = $state<EditorState>('editing');
	let errorMessage = $state('');
	let initialDraftFingerprint = $state<string | null>(null);

	const draftFingerprint = $derived(JSON.stringify(detailsCandidate()));
	const hasUnsavedChanges = $derived(initialDraftFingerprint !== null && draftFingerprint !== initialDraftFingerprint);
	const currencyOptions = currencyCodeSchema.options;

	function browserTimeZone(): string {
		const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return isValidIanaTimeZone(detected) ? detected : 'UTC';
	}

	function detailsCandidate(): unknown {
		return { localCurrency, title: title.trim(), timeZone };
	}

	function populateDraft(): void {
		if (mode === 'create') {
			timeZone = browserTimeZone();
			return;
		}

		localCurrency = trip.itinerary.localCurrency;
		title = trip.itinerary.title;
		timeZone = trip.itinerary.timeZone;
	}

	function validateDetails(): TripDetailsValidation {
		const validation = tripDetailsSchema.safeParse(detailsCandidate());
		if (validation.success) {
			return { details: validation.data, valid: true };
		}
		return {
			error: formatValidationIssues(validation.error.issues, 'trip'),
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

	function cancelEditing(): void {
		if (confirmDiscard()) {
			dialogElement.close();
		}
	}

	async function saveEditing(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const validation = validateDetails();
		if (!validation.valid) {
			errorMessage = validation.error;
			return;
		}

		editorState = 'saving';
		errorMessage = '';
		try {
			const response =
				mode === 'create'
					? await fetch('/api/trips', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ details: validation.details })
						})
					: await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
							method: 'PUT',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ details: validation.details, revision: trip.revision })
						});
			const data = await responseData(response);
			if (mode === 'create') {
				const created = tripCreateResponseSchema.safeParse(data);
				if (!response.ok || !created.success) {
					editorState = 'editing';
					errorMessage = errorFrom(data, 'The trip could not be created.');
					return;
				}
				await onCreated(created.data.slug);
				return;
			}

			if (!response.ok || !editSaveResponseSchema.safeParse(data).success) {
				editorState = 'editing';
				errorMessage = errorFrom(data, 'The trip details could not be saved.');
				return;
			}
			await onSaved();
		} catch {
			editorState = 'editing';
			errorMessage =
				mode === 'create'
					? 'The trip could not be created because the server is unavailable.'
					: 'The trip details could not be saved because the server is unavailable.';
		}
	}

	onMount(() => {
		timeZoneOptions = browserTimeZoneOptions();
		populateDraft();
		initialDraftFingerprint = JSON.stringify(detailsCandidate());
		dialogElement.showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="trip-editor-heading"
	use:draggableDialog={{ canDismiss: confirmDiscard, handleSelector: '[data-dialog-drag-handle]' }}
	oncancel={handleDialogCancel}
	onclose={onDismiss}
>
	<form class="editor shiori-form" data-dialog-scroll-area onsubmit={saveEditing}>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">{mode === 'create' ? 'New trip' : 'Edit trip'}</p>
				<h2 id="trip-editor-heading">
					{mode === 'create' ? 'Create a trip' : trip.itinerary.title}
				</h2>
				<p class:changed={hasUnsavedChanges} class="editor-status">
					{editorState === 'saving' ? 'Saving changes…' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
				</p>
			</div>
			<div class="editor-actions">
				<button class="save-button shiori-form-button" disabled={editorState === 'saving'} type="submit">
					{editorState === 'saving' ? 'Saving…' : mode === 'create' ? 'Create trip' : 'Save changes'}
				</button>
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

		<label class="shiori-form-label">
			Trip name
			<input class="shiori-form-control" bind:value={title} required />
		</label>
		<label class="shiori-form-label" for="trip-time-zone">
			Default time zone
			<span class="field-hint">Used for itinerary items without their own time zone.</span>
			<TimeZonePicker
				id="trip-time-zone"
				onSelect={(value) => (timeZone = value)}
				options={timeZoneOptions}
				value={timeZone}
			/>
		</label>
		<label class="shiori-form-label">
			Local currency
			<span class="field-hint">Newly paid costs are converted to this currency and saved at that rate.</span>
			<select bind:value={localCurrency} class="shiori-form-control">
				{#each currencyOptions as currency (currency)}
					<option value={currency}>{currency}</option>
				{/each}
			</select>
		</label>
		{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
	</form>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-width: min(32rem, calc(100% - 2rem));
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
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	header,
	.editor-actions {
		display: flex;
		gap: 1rem;
	}

	header {
		align-items: start;
		justify-content: space-between;
	}

	.editor-actions {
		align-items: center;
		flex-shrink: 0;
	}

	.eyebrow,
	.editor-status {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.eyebrow {
		font-weight: 700;
		letter-spacing: 0.08em;
		margin: 0 0 0.25rem;
		text-transform: uppercase;
	}

	h2 {
		font-size: 1.25rem;
		margin: 0;
	}

	.editor-status {
		margin: 0.5rem 0 0;
	}

	.editor-status.changed {
		color: var(--color-state-warning);
	}

	.save-button {
		background: var(--color-surface-subtle);
	}

	.close-button {
		border-color: var(--color-border-strong);
	}

	.error {
		color: var(--color-state-error);
		margin: 0;
	}

	@media (max-width: 32rem) {
		header {
			align-items: stretch;
			flex-direction: column;
		}

		.editor-actions {
			justify-content: end;
		}
	}
</style>
