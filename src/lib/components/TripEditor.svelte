<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		apiErrorSchema,
		editSaveResponseSchema,
		tripCreateResponseSchema,
		tripDeleteRequestSchema
	} from '$lib/editing/contracts';
	import { currencyCodeSchema, tripDetailsSchema, type CurrencyCode, type TripDetails } from '$lib/itinerary/schema';
	import { browserTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { isValidIanaTimeZone } from '$lib/itinerary/zoned-time';
	import type { DetailedTripView } from '$lib/server/store/views';
	import {
		maximumTripBackupBytes,
		maximumTripBackupSizeLabel,
		tripBackupFileExtension,
		tripBackupMediaType,
		validateTripBackup,
		type TripBackup
	} from '$lib/trip-backup';
	import { formatValidationIssues } from '$lib/validation';
	import { brandIconFeedback } from '$lib/visuals/brand-feedback.svelte';
	import TimeZonePicker from './TimeZonePicker.svelte';

	type EditorState = 'deleting' | 'editing' | 'importing' | 'saving';
	type CreatedTripCompletion = { readonly kind: 'created'; readonly slug: string };
	type EditedTripCompletion = { readonly kind: 'deleted' } | { readonly kind: 'saved' };
	type TripDetailsValidation =
		{ readonly details: TripDetails; readonly valid: true } | { readonly error: string; readonly valid: false };
	type CreateTripEditorProps = {
		mode: 'create';
		trip: null;
		onDismiss: () => void;
		onCompleted: (completion: CreatedTripCompletion) => Promise<void>;
	};
	type EditTripEditorProps = {
		mode: 'edit';
		trip: DetailedTripView;
		onDismiss: () => void;
		onCompleted: (completion: EditedTripCompletion) => Promise<void>;
	};
	type TripEditorProps = CreateTripEditorProps | EditTripEditorProps;

	let props: TripEditorProps = $props();

	let dialogElement: HTMLDialogElement;
	let title = $state('');
	let timeZone = $state('UTC');
	let localCurrency = $state<CurrencyCode>('AUD');
	let timeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	let editorState = $state<EditorState>('editing');
	let errorMessage = $state('');
	let initialDraftFingerprint = $state<string | null>(null);
	let backupFileInput = $state<HTMLInputElement | null>(null);
	let selectedBackup = $state<TripBackup | null>(null);
	let selectedBackupFileName = $state('');

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
		if (props.mode === 'create') {
			timeZone = browserTimeZone();
			return;
		}

		localCurrency = props.trip.itinerary.localCurrency;
		title = props.trip.itinerary.title;
		timeZone = props.trip.itinerary.timeZone;
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

	function chooseBackupFile(): void {
		backupFileInput?.click();
	}

	async function selectBackupFile(event: Event): Promise<void> {
		if (!(event.currentTarget instanceof HTMLInputElement)) {
			throw new Error('The trip backup selection did not originate from a file input.');
		}

		const file = event.currentTarget.files?.item(0);
		event.currentTarget.value = '';
		if (!file) {
			return;
		}
		if (file.size > maximumTripBackupBytes) {
			selectedBackup = null;
			selectedBackupFileName = '';
			errorMessage = `Choose a trip backup no larger than ${maximumTripBackupSizeLabel}.`;
			return;
		}

		try {
			const validation = validateTripBackup(JSON.parse(await file.text()));
			if (!validation.valid) {
				selectedBackup = null;
				selectedBackupFileName = '';
				errorMessage = validation.message;
				return;
			}
			selectedBackup = validation.backup;
			selectedBackupFileName = file.name;
			errorMessage = '';
		} catch {
			selectedBackup = null;
			selectedBackupFileName = '';
			errorMessage = 'Select a valid Shiori trip backup.';
		}
	}

	async function importSelectedBackup(): Promise<void> {
		if (props.mode !== 'create' || !selectedBackup) {
			return;
		}

		editorState = 'importing';
		errorMessage = '';
		try {
			const response = await fetch('/api/trips/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(selectedBackup)
			});
			const data = await responseData(response);
			const created = tripCreateResponseSchema.safeParse(data);
			if (!response.ok || !created.success) {
				editorState = 'editing';
				errorMessage = errorFrom(data, 'The trip backup could not be imported.');
				return;
			}
			brandIconFeedback.publish('success');
			await props.onCompleted({ kind: 'created', slug: created.data.slug });
		} catch {
			editorState = 'editing';
			errorMessage = 'The trip backup could not be imported because the server is unavailable.';
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
			if (props.mode === 'create') {
				const response = await fetch('/api/trips', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ details: validation.details })
				});
				const data = await responseData(response);
				const created = tripCreateResponseSchema.safeParse(data);
				if (!response.ok || !created.success) {
					editorState = 'editing';
					errorMessage = errorFrom(data, 'The trip could not be created.');
					return;
				}
				brandIconFeedback.publish('success');
				await props.onCompleted({ kind: 'created', slug: created.data.slug });
				return;
			}

			const response = await fetch(`/api/trips/${encodeURIComponent(props.trip.id)}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ details: validation.details, revision: props.trip.revision })
			});
			const data = await responseData(response);
			if (!response.ok || !editSaveResponseSchema.safeParse(data).success) {
				editorState = 'editing';
				errorMessage = errorFrom(data, 'The trip details could not be saved.');
				return;
			}
			brandIconFeedback.publish('success');
			await props.onCompleted({ kind: 'saved' });
		} catch {
			editorState = 'editing';
			errorMessage =
				props.mode === 'create'
					? 'The trip could not be created because the server is unavailable.'
					: 'The trip details could not be saved because the server is unavailable.';
		}
	}

	async function deleteTrip(): Promise<void> {
		if (props.mode !== 'edit' || editorState !== 'editing') {
			return;
		}

		const trip = props.trip;
		if (!window.confirm(`Delete “${trip.itinerary.title}”? This will remove its itinerary and all shared access.`)) {
			return;
		}

		const payload = tripDeleteRequestSchema.safeParse({ revision: trip.revision });
		if (!payload.success) {
			errorMessage = 'The trip could not be deleted.';
			return;
		}

		editorState = 'deleting';
		errorMessage = '';
		try {
			const response = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload.data)
			});
			const data = await responseData(response);
			if (!response.ok) {
				editorState = 'editing';
				errorMessage = errorFrom(data, 'The trip could not be deleted.');
				return;
			}
			brandIconFeedback.publish('success');
			await props.onCompleted({ kind: 'deleted' });
		} catch {
			editorState = 'editing';
			errorMessage = 'The trip could not be deleted because the server is unavailable.';
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
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	oncancel={handleDialogCancel}
	onclose={props.onDismiss}
>
	<form class="editor shiori-form" data-dialog-scroll-area onsubmit={saveEditing}>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">{props.mode === 'create' ? 'New trip' : 'Edit trip'}</p>
				<h2 id="trip-editor-heading">
					{props.mode === 'create' ? 'Create a trip' : props.trip.itinerary.title}
				</h2>
				<p
					class:changed={hasUnsavedChanges}
					class="editor-status"
					data-brand-feedback={editorState === 'editing' ? undefined : 'loading'}
				>
					{editorState === 'saving'
						? 'Saving changes…'
						: editorState === 'deleting'
							? 'Deleting trip…'
							: editorState === 'importing'
								? 'Importing trip…'
								: hasUnsavedChanges
									? 'Unsaved changes'
									: 'All changes saved'}
				</p>
			</div>
			<div class="editor-actions">
				<button class="save-button shiori-form-button" disabled={editorState !== 'editing'} type="submit">
					{editorState === 'saving' ? 'Saving…' : props.mode === 'create' ? 'Create trip' : 'Save changes'}
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
		{#if props.mode === 'create'}
			<section aria-labelledby="trip-backup-heading" class="backup-import">
				<div>
					<h3 id="trip-backup-heading">Import Trip</h3>
					<p>Restore a <code>.{tripBackupFileExtension}</code> file as a new private trip.</p>
				</div>
				{#if selectedBackup}
					<p class="backup-summary">
						Ready to import <strong>{selectedBackup.itinerary.title}</strong> from {selectedBackupFileName} with
						{selectedBackup.itinerary.items.length} itinerary
						{selectedBackup.itinerary.items.length === 1 ? 'item' : 'items'}.
					</p>
					<div class="backup-actions">
						<button
							class="import-button shiori-form-button"
							disabled={editorState !== 'editing'}
							onclick={importSelectedBackup}
							type="button"
						>
							{editorState === 'importing' ? 'Importing…' : 'Import trip'}
						</button>
						<button
							class="choose-backup-button shiori-form-button"
							disabled={editorState !== 'editing'}
							onclick={chooseBackupFile}
							type="button"
						>
							Choose another file
						</button>
					</div>
				{:else}
					<button
						class="choose-backup-button shiori-form-button"
						disabled={editorState !== 'editing'}
						onclick={chooseBackupFile}
						type="button"
					>
						Import Trip
					</button>
				{/if}
				<input
					bind:this={backupFileInput}
					accept={`${tripBackupMediaType},.${tripBackupFileExtension}`}
					onchange={selectBackupFile}
					type="file"
				/>
			</section>
		{/if}
		{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
		{#if props.mode === 'edit'}
			<section aria-labelledby="delete-trip-heading" class="delete-trip">
				<div>
					<h3 id="delete-trip-heading">Delete trip</h3>
					<p>Remove this itinerary and its shared access.</p>
				</div>
				<button
					class="delete-trip-button shiori-form-button"
					disabled={editorState !== 'editing'}
					onclick={() => void deleteTrip()}
					type="button"
				>
					{editorState === 'deleting' ? 'Deleting trip…' : 'Delete trip'}
				</button>
			</section>
		{/if}
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

	.backup-import {
		border-top: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding-top: 1rem;
	}

	.delete-trip {
		border-top: 1px solid var(--color-border-default);
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
		margin-top: 1.5rem;
		padding-top: 1rem;
	}

	.delete-trip h3,
	.delete-trip p {
		margin: 0;
	}

	.delete-trip h3 {
		font-size: 0.9375rem;
	}

	.delete-trip p {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		line-height: 1.4;
		margin-top: 0.25rem;
	}

	.delete-trip-button {
		border-color: var(--color-state-error);
		color: var(--color-state-error);
		flex-shrink: 0;
	}

	.delete-trip-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-state-error) 11%, transparent);
	}

	.backup-import h3,
	.backup-import p {
		margin: 0;
	}

	.backup-import h3 {
		font-size: 0.9375rem;
	}

	.backup-import p {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.backup-import .backup-summary {
		color: var(--color-text-primary);
	}

	.backup-import input[type='file'] {
		display: none;
	}

	.backup-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.import-button {
		background: var(--color-surface-subtle);
	}

	.choose-backup-button {
		border-color: var(--color-border-strong);
	}

	@media (max-width: 32rem) {
		header {
			align-items: stretch;
			flex-direction: column;
		}

		.editor-actions {
			justify-content: end;
		}

		.delete-trip {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
