<script lang="ts">
	import type { CurrencyCode, NoteEntryState } from '$lib/itinerary/schema';
	import { emptyNoteEstimatedCostDraft, emptyNoteLinkDraft, type NoteEntryDraft } from '$lib/itinerary/note-draft';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import TimePicker from './TimePicker.svelte';

	let {
		entry = $bindable<NoteEntryDraft>(),
		entryNumber,
		currencyOptions,
		stateOptions,
		localCurrency,
		disabled,
		onRemove
	}: {
		entry: NoteEntryDraft;
		entryNumber: number;
		currencyOptions: readonly CurrencyCode[];
		stateOptions: readonly NoteEntryState[];
		localCurrency: CurrencyCode;
		disabled: boolean;
		onRemove: () => void;
	} = $props();

	function addEstimatedCost(): void {
		entry = {
			...entry,
			estimatedCosts: [...entry.estimatedCosts, emptyNoteEstimatedCostDraft(crypto.randomUUID(), localCurrency)]
		};
	}

	function removeEstimatedCost(costId: string): void {
		entry = {
			...entry,
			estimatedCosts: entry.estimatedCosts.filter((estimatedCost) => estimatedCost.id !== costId)
		};
	}

	function addLink(): void {
		entry = { ...entry, links: [...entry.links, emptyNoteLinkDraft(crypto.randomUUID())] };
	}

	function removeLink(linkId: string): void {
		entry = { ...entry, links: entry.links.filter((link) => link.id !== linkId) };
	}
</script>

<details class="entry" open>
	<summary>
		<span>Entry {entryNumber}: {entry.title || 'Untitled entry'}</span>
		<span class="entry-state">{entry.state}</span>
	</summary>
	<div class="entry-content">
		<div class="entry-heading">
			<label class="shiori-form-label">
				Title
				<input bind:value={entry.title} class="shiori-form-control" {disabled} required />
			</label>
			<label class="shiori-form-label">
				Planning state
				<select bind:value={entry.state} class="shiori-form-control" {disabled}>
					{#each stateOptions as state (state)}
						<option value={state}>{state[0].toUpperCase()}{state.slice(1)}</option>
					{/each}
				</select>
			</label>
		</div>
		<label class="shiori-form-label">
			Details <span class="field-hint">Optional</span>
			<textarea bind:value={entry.note} class="shiori-form-control" {disabled} rows="3"></textarea>
		</label>
		<div class="time-range">
			<label class="shiori-form-label" for={`${entry.id}-start-time`}>
				Start time <span class="field-hint">Optional</span>
				<TimePicker
					id={`${entry.id}-start-time`}
					timeFormat={viewerContext.formatPreferences.timeFormat}
					value={entry.startTime}
					onChange={(value) => (entry.startTime = value)}
				/>
			</label>
			<label class="shiori-form-label" for={`${entry.id}-end-time`}>
				End time <span class="field-hint">Optional</span>
				<TimePicker
					id={`${entry.id}-end-time`}
					timeFormat={viewerContext.formatPreferences.timeFormat}
					value={entry.endTime}
					onChange={(value) => (entry.endTime = value)}
				/>
			</label>
		</div>
		<section aria-label={`Estimated costs for ${entry.title || `entry ${entryNumber}`}`} class="estimated-costs">
			<div class="cost-heading">
				<h4>Estimated costs</h4>
				<button {disabled} onclick={addEstimatedCost} type="button">Add estimate</button>
			</div>
			{#each entry.estimatedCosts as estimatedCost (estimatedCost.id)}
				<div class="estimated-cost">
					<label class="shiori-form-label">
						Label <span class="field-hint">Optional</span>
						<input bind:value={estimatedCost.label} class="shiori-form-control" {disabled} />
					</label>
					<label class="shiori-form-label">
						Amount
						<input bind:value={estimatedCost.amount} class="shiori-form-control" {disabled} inputmode="decimal" />
					</label>
					<label class="shiori-form-label">
						Currency
						<select bind:value={estimatedCost.currency} class="shiori-form-control" {disabled}>
							{#each currencyOptions as currency (currency)}
								<option value={currency}>{currency}</option>
							{/each}
						</select>
					</label>
					<button {disabled} onclick={() => removeEstimatedCost(estimatedCost.id)} type="button">Remove</button>
				</div>
			{/each}
		</section>
		<section aria-label={`Links for ${entry.title || `entry ${entryNumber}`}`} class="entry-links">
			<div class="link-heading">
				<h4>Links</h4>
				<button {disabled} onclick={addLink} type="button">Add link</button>
			</div>
			{#each entry.links as link (link.id)}
				<div class="note-link">
					<label class="shiori-form-label">
						Name
						<input bind:value={link.name} class="shiori-form-control" {disabled} />
					</label>
					<label class="shiori-form-label">
						URL
						<input bind:value={link.url} class="shiori-form-control" {disabled} type="url" />
					</label>
					<button {disabled} onclick={() => removeLink(link.id)} type="button">Remove</button>
				</div>
			{/each}
		</section>
		<button class="remove-entry" {disabled} onclick={onRemove} type="button">Remove entry</button>
	</div>
</details>

<style>
	.field-hint {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	h4 {
		font-size: 0.875rem;
		margin: 0;
	}

	.entry {
		border: 1px solid var(--color-border-default);
		margin: 0;
	}

	.entry summary {
		align-items: center;
		cursor: pointer;
		display: flex;
		font-size: 0.8125rem;
		font-weight: 700;
		gap: 1rem;
		justify-content: space-between;
		padding: 1rem;
	}

	.entry summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: -3px;
	}

	.entry-state {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 400;
		text-transform: capitalize;
	}

	.entry-content {
		display: grid;
		gap: 1rem;
		padding: 0 1rem 1rem;
	}

	.entry-heading,
	.cost-heading,
	.link-heading {
		display: flex;
		gap: 1rem;
	}

	.entry-heading > label:first-child {
		flex: 1;
	}

	.time-range,
	.estimated-cost,
	.note-link {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.estimated-costs,
	.entry-links {
		border-top: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		padding-top: 1rem;
	}

	.cost-heading,
	.link-heading {
		align-items: center;
		justify-content: space-between;
	}

	.cost-heading button,
	.link-heading button,
	.estimated-cost button,
	.note-link button,
	.remove-entry {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.375rem 0.625rem;
	}

	.estimated-cost {
		align-items: end;
		grid-template-columns: minmax(0, 1fr) minmax(8rem, 0.65fr) minmax(5rem, 0.4fr) auto;
	}

	.note-link {
		align-items: end;
		grid-template-columns: minmax(0, 0.6fr) minmax(0, 1fr) auto;
	}

	.remove-entry {
		border-color: var(--color-state-error);
		color: var(--color-state-error);
		justify-self: start;
	}

	button:focus-visible,
	textarea:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 38rem) {
		.entry-heading,
		.estimated-cost,
		.note-link {
			align-items: stretch;
			flex-direction: column;
			grid-template-columns: 1fr;
		}

		.time-range {
			grid-template-columns: 1fr;
		}
	}
</style>
