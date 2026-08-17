<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { browserPages, browserTitle } from '$lib/browser-title';
	import TripEditor from '$lib/components/TripEditor.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { ConnectivityMonitor } from '$lib/connectivity.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let creatingTrip = $state(false);
	const connectivity = new ConnectivityMonitor();
	const canCreateTrip = $derived(connectivity.status === 'reachable');

	function beginTripCreation(): void {
		if (canCreateTrip) {
			creatingTrip = true;
		}
	}

	async function finishTripCreation(completion: { readonly kind: 'created'; readonly slug: string }): Promise<void> {
		creatingTrip = false;
		await goto(resolve('/trips/[slug]', { slug: completion.slug }));
	}

	$effect(() => {
		if (connectivity.status !== 'reachable') {
			creatingTrip = false;
		}
	});

	onMount(() => connectivity.start());
</script>

<svelte:head>
	<title>{browserTitle(browserPages.trips)}</title>
	<meta name="description" content="Your available Shiori travel itineraries." />
</svelte:head>

<TripTopbar
	activePage="trips"
	canManageAccounts={data.canManageAccounts}
	currentUser={data.currentUser}
	isOffline={connectivity.status === 'unreachable'}
/>

<main>
	<ul class="trip-list">
		{#each data.trips as trip (trip.slug)}
			<li>
				<a href={resolve('/trips/[slug]', { slug: trip.slug })}>
					<strong>{trip.title}</strong>
					<small>{trip.latestItemStartAt === null ? 'No itinerary items yet' : 'Itinerary available'}</small>
				</a>
			</li>
		{/each}
		{#if canCreateTrip}
			<li>
				<button class="new-trip-button" onclick={beginTripCreation} type="button">
					<strong>New trip</strong>
					<small>Create a private trip</small>
				</button>
			</li>
		{/if}
	</ul>
</main>

{#if creatingTrip}
	<TripEditor mode="create" trip={null} onCompleted={finishTripCreation} onDismiss={() => (creatingTrip = false)} />
{/if}

<style>
	.trip-list a:focus-visible,
	.new-trip-button:focus-visible {
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

	.trip-list a,
	.new-trip-button {
		background: transparent;
		border: 0;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.25rem;
		padding: 1rem;
		text-align: left;
		text-decoration: none;
		width: 100%;
	}

	.trip-list a:hover,
	.new-trip-button:hover {
		background: var(--color-surface-subtle);
	}

	.new-trip-button {
		cursor: pointer;
	}

	.trip-list strong {
		font-size: 1.125rem;
	}

	.trip-list small {
		color: var(--color-text-muted);
	}
</style>
