<script lang="ts">
	import { formatMonetaryAmount } from '$lib/money';
	import type { ItineraryNote } from '$lib/itinerary/schema';

	let {
		defaultTimeZone,
		heading,
		note,
		onEdit
	}: {
		defaultTimeZone: string;
		heading: string;
		note: ItineraryNote;
		onEdit: (() => void) | undefined;
	} = $props();

	function entryTime(entry: ItineraryNote['entries'][number]): string | undefined {
		if (entry.startTime !== undefined && entry.endTime !== undefined) {
			return `${entry.startTime}–${entry.endTime}`;
		}
		return entry.startTime ?? entry.endTime;
	}

	function estimatedCostsSummary(entry: ItineraryNote['entries'][number]): string | undefined {
		if (entry.estimatedCosts.length === 0) {
			return undefined;
		}
		return entry.estimatedCosts
			.map((estimatedCost) => formatMonetaryAmount(estimatedCost.amountMinor, estimatedCost.currency))
			.join(' · ');
	}
</script>

<section aria-label={heading} class="note">
	<div class="note-heading">
		<div>
			<h2>{heading}</h2>
			{#if note.timeZone !== defaultTimeZone}
				<p class="time-zone">Times use {note.timeZone}.</p>
			{/if}
		</div>
		{#if onEdit}<button onclick={onEdit} type="button">Edit</button>{/if}
	</div>
	{#if note.text}<p class="freeform-text">{note.text}</p>{/if}
	{#if note.entries.length > 0}
		<ul class="entries">
			{#each note.entries as entry (entry.id)}
				<li>
					<details>
						<summary>
							<span class="entry-title">{entry.title}</span>
							<span class="badges">
								{#if entry.state !== 'idea'}<span class="state">{entry.state}</span>{/if}
								{#if entryTime(entry)}<span>{entryTime(entry)}</span>{/if}
								{#if estimatedCostsSummary(entry)}<span>{estimatedCostsSummary(entry)}</span>{/if}
							</span>
						</summary>
						<div class="entry-detail">
							{#if entry.note}<p>{entry.note}</p>{/if}
							{#if entry.estimatedCosts.length > 0}
								<section aria-label={`Estimated costs for ${entry.title}`} class="costs">
									<h3>Estimated costs</h3>
									<ul>
										{#each entry.estimatedCosts as estimatedCost (estimatedCost.id)}
											<li>
												{#if estimatedCost.label}<span>{estimatedCost.label}</span>{/if}
												<span>{formatMonetaryAmount(estimatedCost.amountMinor, estimatedCost.currency)}</span>
											</li>
										{/each}
									</ul>
								</section>
							{/if}
						</div>
					</details>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.note {
		border: 1px solid var(--color-border-default);
		padding: clamp(1rem, 3vw, 1.5rem);
	}

	.note-heading {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	h2,
	h3,
	p {
		margin-top: 0;
	}

	h2 {
		font-size: 1.125rem;
		margin-bottom: 0;
	}

	h3 {
		font-size: 0.8125rem;
	}

	button {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.375rem 0.625rem;
	}

	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.time-zone {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		margin: 0.375rem 0 0;
	}

	.freeform-text,
	.entry-detail p {
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.freeform-text {
		margin: 1rem 0 0;
	}

	.entries {
		border-top: 1px solid var(--color-border-default);
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
	}

	.entries > li + li {
		border-top: 1px solid var(--color-border-default);
	}

	details {
		padding: 0.75rem 0;
	}

	summary {
		align-items: center;
		cursor: pointer;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.entry-title {
		font-weight: 700;
	}

	.badges {
		align-items: center;
		color: var(--color-text-muted);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.8125rem;
		gap: 0.375rem;
		justify-content: end;
	}

	.badges > span {
		border: 1px solid var(--color-border-default);
		padding: 0.1875rem 0.375rem;
	}

	.badges > .state {
		border-color: var(--color-state-selection);
		text-transform: capitalize;
	}

	.entry-detail {
		padding: 1rem 0 0 1.25rem;
	}

	.entry-detail p {
		margin-bottom: 0;
	}

	.costs {
		margin-top: 1rem;
	}

	.costs ul {
		display: grid;
		gap: 0.375rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.costs li {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	@media (max-width: 32rem) {
		.note-heading,
		summary {
			align-items: start;
			flex-direction: column;
		}

		.badges {
			justify-content: start;
		}
	}
</style>
