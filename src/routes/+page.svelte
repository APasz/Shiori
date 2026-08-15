<script lang="ts">
	import TripPage from '$lib/trip-page/TripPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<TripPage {data} />
