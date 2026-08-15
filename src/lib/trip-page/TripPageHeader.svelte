<script lang="ts">
	import ItineraryNowNext from '$lib/components/ItineraryNowNext.svelte';
	import type { ConnectivityStatus, TripPageData } from './types';

	let {
		data,
		connectivityStatus
	}: {
		data: TripPageData;
		connectivityStatus: ConnectivityStatus;
	} = $props();

	const itinerary = $derived(data.trip.itinerary);
</script>

<header>
	{#if connectivityStatus === 'unreachable'}
		<p class="offline-status" role="status">
			Shiori is unreachable · showing the last saved itinerary. Changes require a connection.
		</p>
	{/if}
	<h1>{itinerary.title}</h1>
	<ItineraryNowNext items={itinerary.items} tripTimeZone={itinerary.timeZone} />
</header>

<style>
	header {
		border-bottom: 1px solid var(--color-border-default);
		padding: 0 1rem 0.75rem;
	}

	.offline-status {
		background: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border-default);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 1rem;
		text-align: center;
	}

	h1 {
		font-size: clamp(1.8rem, 6.4vw, 3.6rem);
		letter-spacing: -0.045em;
		line-height: 1;
		margin: 0;
		text-align: center;
	}
</style>
