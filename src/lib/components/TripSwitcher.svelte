<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import { formatLocalDay } from '$lib/itinerary/presentation';
	import { formatTimestampInTimeZone } from '$lib/itinerary/time';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import type { TripSwitchOption } from '$lib/server/store';

	let {
		currentSlug,
		trips,
		onDismiss
	}: {
		currentSlug: string;
		trips: TripSwitchOption[];
		onDismiss: () => void;
	} = $props();

	let dialogElement: HTMLDialogElement;

	function latestItemLabel(timestamp: number | null): string {
		if (timestamp === null) {
			return 'No itinerary items';
		}
		const date = formatTimestampInTimeZone(timestamp, viewerContext.timeZone)?.date;
		return date ? `Latest item: ${formatLocalDay(date)}` : 'Latest item planned';
	}

	onMount(() => {
		dialogElement.showModal();
	});
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby="trip-switcher-heading"
	use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
	onclose={onDismiss}
>
	<section class="switcher" data-dialog-scroll-area>
		<header data-dialog-drag-handle>
			<div>
				<p class="eyebrow">Trips</p>
				<h2 id="trip-switcher-heading">Switch trip</h2>
			</div>
			<form method="dialog"><button type="submit">Close</button></form>
		</header>
		<ul>
			{#each trips as trip (trip.slug)}
				<li>
					{#if trip.slug === currentSlug}
						<span aria-current="page" class="trip current">
							<strong>{trip.title}</strong>
							<small>{latestItemLabel(trip.latestItemStartAt)}</small>
						</span>
					{:else if trip.slug === 'example'}
						<a class="trip" href={resolve('/')}>
							<strong>{trip.title}</strong>
							<small>{latestItemLabel(trip.latestItemStartAt)}</small>
						</a>
					{:else}
						<a class="trip" href={resolve('/trips/[slug]', { slug: trip.slug })}>
							<strong>{trip.title}</strong>
							<small>{latestItemLabel(trip.latestItemStartAt)}</small>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</dialog>

<style>
	dialog {
		background: transparent;
		border: 0;
		color: var(--color-text-primary);
		max-height: calc(100dvh - 2rem);
		max-width: min(32rem, calc(100% - 2rem));
		padding: 0;
		width: 100%;
	}

	dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 88%, transparent);
	}

	.switcher {
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

	h2 {
		font-size: 1.25rem;
		margin: 0;
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

	button:focus-visible,
	.trip:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	ul {
		list-style: none;
		margin: 1.25rem 0 0;
		padding: 0;
	}

	li + li {
		border-top: 1px solid var(--color-border-subtle);
	}

	.trip {
		color: inherit;
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem;
		text-decoration: none;
	}

	a.trip:hover {
		background: var(--color-surface-subtle);
	}

	.trip.current {
		box-shadow: inset 3px 0 var(--color-state-selection);
	}

	small {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
</style>
