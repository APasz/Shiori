<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { onMount, type Component } from 'svelte';
	import appIcon from '$lib/assets/icon.svg';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import '$lib/styles/dialogs.css';
	import '$lib/styles/forms.css';
	import '$lib/styles/page-titles.css';
	import { themeStyleTag } from '$lib/theme/palette';
	import { themeInitializationScript } from '$lib/theme/theme';
	import BrandFeedbackMonitor from '$lib/visuals/BrandFeedbackMonitor.svelte';
	import { registerOfflineSupport } from '$lib/offline';

	let { children } = $props();
	let DevelopmentViewerControls = $state<Component | null>(null);
	const inlineThemeToggleRoutes = new Set([
		'/',
		'/accounts',
		'/settings/access',
		'/trips/[slug]',
		'/trips/[slug]/notes',
		'/trips/[slug]/costs'
	]);
	const hasInlineThemeToggle = $derived(inlineThemeToggleRoutes.has(page.route.id ?? ''));

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
	<link rel="icon" href={appIcon} type="image/svg+xml" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- Hash allowlisted by the CSP from its local source. -->
	{@html themeInitializationScript}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- The local palette is validated before rendering. -->
	{@html themeStyleTag}
</svelte:head>

{#if !hasInlineThemeToggle}
	<ThemeToggle />
{/if}

<BrandFeedbackMonitor />

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
