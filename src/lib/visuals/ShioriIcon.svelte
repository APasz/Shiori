<script lang="ts">
	import iconMarkup from '$lib/assets/icon.svg?raw';
	import type { BrandIconFeedbackState } from './brand-feedback.svelte';

	const transientFeedbackDurationMilliseconds = 1_800;

	let {
		feedbackState = 'idle',
		eventId = 0,
		size = '1em',
		class: className = ''
	}: {
		feedbackState?: BrandIconFeedbackState;
		eventId?: number;
		size?: number | string;
		class?: string;
	} = $props();

	const dimension = $derived(typeof size === 'number' ? `${size}px` : size);
	let visualState = $state<BrandIconFeedbackState>('idle');

	$effect(() => {
		void eventId;
		if (feedbackState === 'idle' || feedbackState === 'loading') {
			visualState = feedbackState;
			return;
		}

		visualState = feedbackState;
		const resetTimer = window.setTimeout(() => {
			visualState = 'idle';
		}, transientFeedbackDurationMilliseconds);
		return () => window.clearTimeout(resetTimer);
	});
</script>

<span
	aria-hidden="true"
	class={`shiori-icon ${className}`}
	data-state={visualState}
	style={`--shiori-icon-size: ${dimension};`}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- The bundled icon markup is a static local asset. -->
	{@html iconMarkup}
</span>

<style>
	.shiori-icon {
		display: inline-block;
		height: var(--shiori-icon-size);
		width: calc(var(--shiori-icon-size) * 105 / 182);
	}

	.shiori-icon :global(svg) {
		display: block;
		height: 100%;
		width: 100%;
	}

	.shiori-icon[data-state='success'] {
		--color-icon-route: var(--color-state-success);
	}

	.shiori-icon[data-state='warning'] {
		--color-icon-route: var(--color-state-warning);
	}

	.shiori-icon[data-state='error'] {
		--color-icon-route: var(--color-state-error);
	}

	.shiori-icon[data-state='loading'] :global(.route) {
		animation: shiori-route-loading 1.2s ease-in-out infinite alternate;
		stroke-dasharray: 900;
		stroke-dashoffset: 900;
	}

	.shiori-icon[data-state='loading'] :global(.route-node) {
		animation: shiori-route-node-loading 1.2s ease-in-out infinite alternate;
	}

	@keyframes shiori-route-loading {
		to {
			stroke-dashoffset: 0;
		}
	}

	@keyframes shiori-route-node-loading {
		to {
			opacity: 0.55;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.shiori-icon[data-state='loading'] :global(.route),
		.shiori-icon[data-state='loading'] :global(.route-node) {
			animation: none;
		}

		.shiori-icon[data-state='loading'] :global(.route) {
			stroke-dasharray: none;
			stroke-dashoffset: 0;
		}
	}
</style>
