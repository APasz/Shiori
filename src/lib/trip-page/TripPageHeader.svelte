<script lang="ts">
	import { resolve } from '$app/paths';
	import ItineraryNowNext from '$lib/components/ItineraryNowNext.svelte';
	import { clearOfflineTripPages } from '$lib/offline';
	import type { ConnectivityStatus, TripPageData } from './types';

	let {
		data,
		connectivityStatus,
		canModifyItinerary,
		canManageTrip,
		onExport,
		onSwitchTrips,
		onCreateTrip,
		onEditTrip
	}: {
		data: TripPageData;
		connectivityStatus: ConnectivityStatus;
		canModifyItinerary: boolean;
		canManageTrip: boolean;
		onExport: () => void;
		onSwitchTrips: () => void;
		onCreateTrip: () => void;
		onEditTrip: () => void;
	} = $props();

	let tripOverflowOpen = $state(false);
	const itinerary = $derived(data.trip.itinerary);
	const notesHref = $derived(resolve('/trips/[slug]/notes', { slug: data.trip.slug }));

	function switchTrips(): void {
		tripOverflowOpen = false;
		onSwitchTrips();
	}

	function createTrip(): void {
		tripOverflowOpen = false;
		onCreateTrip();
	}

	function editTrip(): void {
		tripOverflowOpen = false;
		onEditTrip();
	}
</script>

<header>
	{#if connectivityStatus === 'unreachable'}
		<p class="offline-status" role="status">
			Shiori is unreachable · showing the last saved itinerary. Changes require a connection.
		</p>
	{/if}
	<nav aria-label="Account">
		{#if data.trip.access !== 'visitor'}
			<a href={notesHref}>Notes</a>
		{/if}
		{#if data.trip.access === 'admin' || data.trip.access === 'sudo'}
			<a href={resolve('/trips/[slug]/costs', { slug: data.trip.slug })}>Costs</a>
		{/if}
		{#if data.currentUser}
			<span>Signed as {data.currentUser.username}</span>
			{#if data.trip.access === 'sudo' && canModifyItinerary}
				<a href={resolve(`/settings/access?trip=${encodeURIComponent(data.trip.slug)}`)}>Access</a>
			{/if}
			<form action="/logout" method="POST" onsubmit={clearOfflineTripPages}>
				<button type="submit">Sign out</button>
			</form>
		{:else if data.setupRequired}
			<a href={resolve('/setup')}>Set up Shiori</a>
		{:else}
			<a href={resolve('/login')}>Sign in</a>
		{/if}
		<button onclick={onExport} type="button">Export</button>
		{#if canManageTrip}
			<details bind:open={tripOverflowOpen} class="trip-overflow">
				<summary aria-label="Trip options" title="Trip options">•••</summary>
				<div class="trip-overflow-menu">
					<button onclick={switchTrips} type="button">Switch trip</button>
					{#if canModifyItinerary}
						<button onclick={createTrip} type="button">New trip</button>
						<button onclick={editTrip} type="button">Edit trip</button>
					{/if}
				</div>
			</details>
		{/if}
	</nav>
	<h1>{itinerary.title}</h1>
	<ItineraryNowNext items={itinerary.items} tripTimeZone={itinerary.timeZone} />
</header>

<style>
	header {
		border-bottom: 1px solid var(--color-border-default);
		padding: clamp(3rem, 5vw, 4rem) 1rem 0.75rem;
	}

	.offline-status {
		background: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border-default);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 1rem;
		text-align: center;
	}

	nav {
		align-items: center;
		background: var(--color-surface-page);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.8125rem;
		gap: 0.375rem;
		justify-content: end;
		max-width: calc(100vw - 6.5rem);
		position: fixed;
		right: 5.75rem;
		top: 1rem;
		z-index: 1;
	}

	nav form {
		margin: 0;
	}

	nav a,
	nav button {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		font: inherit;
		padding: 0.25rem 0.5rem;
		text-decoration: none;
	}

	nav button {
		cursor: pointer;
	}

	nav a:focus-visible,
	nav button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.trip-overflow {
		position: relative;
	}

	.trip-overflow summary {
		align-items: center;
		background: transparent;
		border: 1px solid var(--color-border-default);
		cursor: pointer;
		display: flex;
		font-size: 1rem;
		height: 1.875rem;
		justify-content: center;
		letter-spacing: 0.1em;
		list-style: none;
		padding: 0 0.5rem 0 0.6rem;
	}

	.trip-overflow summary::-webkit-details-marker {
		display: none;
	}

	.trip-overflow summary:hover,
	.trip-overflow[open] summary {
		border-color: var(--color-border-strong);
	}

	.trip-overflow summary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 0.25rem;
	}

	.trip-overflow-menu {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		display: grid;
		gap: 0.25rem;
		padding: 0.25rem;
		position: absolute;
		right: 0;
		top: calc(100% + 0.25rem);
		width: max-content;
		z-index: 2;
	}

	.trip-overflow-menu button {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.5rem 0.625rem;
		text-align: left;
	}

	.trip-overflow-menu button:hover {
		background: var(--color-surface-subtle);
	}

	.trip-overflow-menu button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: -2px;
	}

	h1 {
		font-size: clamp(2.25rem, 8vw, 4.5rem);
		letter-spacing: -0.045em;
		line-height: 1;
		margin: 0;
		text-align: center;
	}

	@media (max-width: 32rem) {
		nav {
			right: 4.75rem;
			top: 0.5rem;
		}
	}
</style>
