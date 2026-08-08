<script lang="ts">
	import { dev } from '$app/environment';
	import { afterNavigate } from '$app/navigation';
	import { onMount, type Component } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import '$lib/styles/dialogs.css';
	import '$lib/styles/forms.css';
	import { themeStyleTag } from '$lib/theme/palette';
	import { themeInitializationScript } from '$lib/theme/theme';
	import { refreshOfflineTripPage, registerOfflineSupport } from '$lib/offline';

	let { children } = $props();
	let DevelopmentViewerControls = $state<Component | null>(null);

	if (!dev) {
		afterNavigate(() => {
			refreshOfflineTripPage();
		});
	}

	onMount(() => {
		viewerContext.initialize();
		if (!dev) {
			registerOfflineSupport();
		}
		if (dev) {
			void import('$lib/components/DevelopmentViewerControls.svelte').then((module) => {
				DevelopmentViewerControls = module.default;
			});
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- The static theme initializer contains only local constants. -->
	{@html themeInitializationScript}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- The local palette is validated before rendering. -->
	{@html themeStyleTag}
</svelte:head>

<ThemeToggle />

{@render children()}

{#if DevelopmentViewerControls}
	<DevelopmentViewerControls />
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		scrollbar-gutter: stable;
	}

	:global(body) {
		background: var(--color-surface-page);
		color: var(--color-text-primary);
		font-family:
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		margin: 0;
	}
</style>
