<script lang="ts">
	import ItineraryNowNext from '$lib/components/ItineraryNowNext.svelte';
	import PageTitle from '$lib/components/PageTitle.svelte';
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

<header class="page-heading">
	{#if connectivityStatus === 'unreachable'}
		<p class="offline-status" data-brand-feedback="warning" role="status">
			Shiori is unreachable · showing the last saved itinerary. Changes require a connection.
		</p>
	{/if}
	<PageTitle title={itinerary.title} />
	<ItineraryNowNext items={itinerary.items} tripTimeZone={itinerary.timeZone} />
</header>

<style>
	.offline-status {
		background: var(--color-surface-raised);
		font-size: 0.8125rem;
		margin: 0 0 1rem;
		padding: 0.5rem;
		text-align: center;
	}
</style>
