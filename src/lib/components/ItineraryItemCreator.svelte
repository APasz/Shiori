<script lang="ts">
	import { onMount } from 'svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		apiErrorSchema,
		itineraryItemImportResponseSchema,
		type ItineraryItemImport
	} from '$lib/editing/contracts';
	import type { ItineraryItemType } from '$lib/itinerary/schema';

	type CreatorState = 'entry' | 'importing' | 'review';

	let {
		tripId,
		onDismiss,
		onManual,
		onImported
	}: {
		tripId: string;
		onDismiss: () => void;
		onManual: (type: ItineraryItemType) => void;
		onImported: (item: ItineraryItemImport) => void;
	} = $props();

	let dialogElement: HTMLDialogElement;
	let url = $state('');
	let errorMessage = $state('');
	let creatorState = $state<CreatorState>('entry');
	let importedItems = $state<ItineraryItemImport[]>([]);

	function endpoint(): string {
		return `/api/trips/${encodeURIComponent(tripId)}/items/import`;
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
		dialogElement.close();
		onManual(type);
	}

	function selectImportedItem(item: ItineraryItemImport): void {
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
			? `${item.transport.operator}${item.transport.serviceNumber ?? ''} · `
			: '';
		return `${service}${route}`;
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
					{creatorState === 'review' ? 'Review imported items' : 'Add an item'}
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
		{:else}
			<p class="intro">
				Paste a Google Maps place or directions link, or a Google Flights link. We’ll prefill what
				we can, then you can review it.
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
					<button
						disabled={creatorState === 'importing'}
						onclick={() => startManual('transport')}
						type="button">Transport</button
					>
					<button
						disabled={creatorState === 'importing'}
						onclick={() => startManual('activity')}
						type="button">Activity</button
					>
					<button
						disabled={creatorState === 'importing'}
						onclick={() => startManual('accommodation')}
						type="button">Accommodation</button
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
	}
</style>
