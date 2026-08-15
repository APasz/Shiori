<script lang="ts">
	import { resolve } from '$app/paths';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Trips · Shiori</title>
	<meta name="description" content="Your available Shiori travel itineraries." />
</svelte:head>

<TripTopbar activePage="trips" canManageAccounts={data.canManageAccounts} currentUser={data.currentUser} />

<main>
	{#if data.trips.length > 0}
		<ul class="trip-list">
			{#each data.trips as trip (trip.slug)}
				<li>
					<a href={resolve('/trips/[slug]', { slug: trip.slug })}>
						<strong>{trip.title}</strong>
						<small>{trip.latestItemStartAt === null ? 'No itinerary items yet' : 'Itinerary available'}</small>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty-state">No trips are available to this account yet.</p>
	{/if}
</main>

<style>
	.trip-list a:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	main {
		margin: 0 auto;
		padding: 1rem;
		width: min(100%, 44rem);
	}

	.trip-list {
		border-bottom: 1px solid var(--color-border-default);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.trip-list li {
		border-top: 1px solid var(--color-border-default);
	}

	.trip-list a {
		color: inherit;
		display: grid;
		gap: 0.25rem;
		padding: 1rem;
		text-decoration: none;
	}

	.trip-list a:hover {
		background: var(--color-surface-subtle);
	}

	.trip-list strong {
		font-size: 1.125rem;
	}

	.trip-list small,
	.empty-state {
		color: var(--color-text-muted);
	}

	.empty-state {
		border: 1px solid var(--color-border-default);
		margin: 2rem 0 0;
		padding: 1rem;
	}
</style>
