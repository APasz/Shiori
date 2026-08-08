<script lang="ts">
	import TripPage from '../../+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<TripPage {data} />
