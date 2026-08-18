<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		createItineraryExportFile,
		defaultItineraryExportOptions,
		itineraryExportFormatMetadata,
		itineraryExportFormats,
		type ItineraryExportFile,
		type ItineraryExportFormat,
		type ItineraryExportSource
	} from '$lib/itinerary/export';

	let { itinerary, onDismiss }: { itinerary: ItineraryExportSource; onDismiss: () => void } = $props();

	let dialogElement: HTMLDialogElement;
	let format = $state<ItineraryExportFormat>('json');
	type ClipboardCopyStatus = 'idle' | 'copying' | 'copied' | 'failed';
	let clipboardCopyStatus = $state<ClipboardCopyStatus>('idle');
	let includeNotes = $state(defaultItineraryExportOptions.includeNotes);
	let includeLinksAndDocuments = $state(defaultItineraryExportOptions.includeLinksAndDocuments);
	let includeReservationDetails = $state(defaultItineraryExportOptions.includeReservationDetails);
	let includeCosts = $state(defaultItineraryExportOptions.includeCosts);
	let includeCoordinates = $state(defaultItineraryExportOptions.includeCoordinates);
	let useEpochTimestamps = $state(defaultItineraryExportOptions.useEpochTimestamps);
	let normalizeCostAmounts = $state(defaultItineraryExportOptions.normalizeCostAmounts);

	function exportFile(): ItineraryExportFile {
		return createItineraryExportFile(itinerary, format, {
			includeCoordinates,
			includeCosts,
			includeLinksAndDocuments,
			includeNotes,
			includeReservationDetails,
			normalizeCostAmounts,
			useEpochTimestamps
		});
	}

	function downloadExport(): void {
		const file = exportFile();
		const objectUrl = URL.createObjectURL(new Blob([file.contents], { type: file.mediaType }));
		const download = document.createElement('a');
		download.download = file.filename;
		download.href = objectUrl;
		download.click();
		window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
	}

	async function copyExportToClipboard(): Promise<void> {
		clipboardCopyStatus = 'copying';

		try {
			await navigator.clipboard.writeText(exportFile().contents);
			clipboardCopyStatus = 'copied';
		} catch {
			clipboardCopyStatus = 'failed';
		}
	}

	onMount(() => {
		dialogElement.showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="itinerary-exporter-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	onclose={onDismiss}
>
	<div class="exporter" data-dialog-scroll-area>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">Itinerary export</p>
				<h2 id="itinerary-exporter-heading">Export {itinerary.title}</h2>
				<p class="intro">Download a copy of the itinerary with only the details you choose.</p>
			</div>
			<form method="dialog">
				<button class="close-button shiori-form-button" type="submit">Close</button>
			</form>
		</header>

		<fieldset>
			<legend>Format</legend>
			<div class="options">
				{#each itineraryExportFormats as exportFormat (exportFormat)}
					<label class="option">
						<input bind:group={format} name="format" type="radio" value={exportFormat} />
						<span>{itineraryExportFormatMetadata[exportFormat].label}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend>Include</legend>
			<div class="options">
				<label class="option">
					<input bind:checked={includeNotes} type="checkbox" />
					<span>Notes</span>
				</label>
				<label class="option">
					<input bind:checked={includeLinksAndDocuments} type="checkbox" />
					<span>Links and documents</span>
				</label>
				<label class="option">
					<input bind:checked={includeReservationDetails} type="checkbox" />
					<span>Reservation details</span>
				</label>
				<label class="option">
					<input bind:checked={includeCosts} type="checkbox" />
					<span>Costs</span>
				</label>
				<label class="option">
					<input bind:checked={includeCoordinates} type="checkbox" />
					<span>Location coordinates</span>
				</label>
			</div>
		</fieldset>

		<fieldset>
			<legend>Representation</legend>
			<div class="options">
				<label class="option">
					<input bind:checked={useEpochTimestamps} type="checkbox" />
					<span>Use epoch timestamps (milliseconds)</span>
				</label>
				<label class="option">
					<input bind:checked={normalizeCostAmounts} type="checkbox" />
					<span>Normalize costs to decimal amounts</span>
				</label>
			</div>
		</fieldset>

		<div class="actions">
			{#if clipboardCopyStatus !== 'idle'}
				<p aria-live="polite" class:copy-error={clipboardCopyStatus === 'failed'} class="copy-status">
					{clipboardCopyStatus === 'copying'
						? 'Copying export…'
						: clipboardCopyStatus === 'copied'
							? 'Export copied to clipboard.'
							: 'Could not copy the export to the clipboard.'}
				</p>
			{/if}
			<button
				class="copy-button shiori-form-button"
				disabled={clipboardCopyStatus === 'copying'}
				onclick={() => void copyExportToClipboard()}
				type="button"
			>
				Copy Clipboard
			</button>
			<button class="download-button shiori-form-button" onclick={downloadExport} type="button">Download</button>
		</div>
	</div>
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

	.exporter {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		padding: clamp(1.25rem, 4vw, 2rem);
	}

	header {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	h2,
	p {
		margin-top: 0;
	}

	h2 {
		font-size: clamp(1.35rem, 4vw, 1.75rem);
		margin-bottom: 0.25rem;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin-bottom: 0.25rem;
		text-transform: uppercase;
	}

	.intro {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 0;
	}

	.close-button,
	.copy-button,
	.download-button {
		cursor: pointer;
	}

	fieldset {
		border: 0;
		border-top: 1px solid var(--color-border-default);
		margin: 1.25rem 0 0;
		padding: 1rem 0 0;
	}

	legend {
		font-size: 0.875rem;
		font-weight: 700;
		padding: 0 0.25rem 0 0;
	}

	.options {
		display: grid;
		gap: 0.625rem;
		margin-top: 0.75rem;
	}

	.option {
		align-items: center;
		display: flex;
		gap: 0.5rem;
	}

	.option input {
		accent-color: var(--color-accent-primary);
		block-size: 1rem;
		inline-size: 1rem;
		margin: 0;
	}

	.actions {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		justify-content: end;
		margin-top: 1.5rem;
	}

	.copy-status {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin: 0 auto 0 0;
	}

	.copy-error {
		color: var(--color-state-error);
	}
</style>
