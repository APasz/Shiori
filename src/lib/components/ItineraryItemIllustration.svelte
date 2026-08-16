<script lang="ts">
	import { onMount } from 'svelte';
	import Artwork from '$lib/visuals/Artwork.svelte';
	import { itineraryIllustration, type ItineraryIllustrationSource } from '$lib/itinerary/illustration';
	import { itemIllustrationHeight, itemIllustrationLayout } from './item-illustration-layout';

	const illustrationInset = 8;
	const illustrationGap = 8;

	let { item }: { item: ItineraryIllustrationSource } = $props();
	let illustrationViewport: HTMLSpanElement;

	const illustration = $derived(itineraryIllustration(item));

	onMount(() => {
		const itemElement = illustrationViewport.parentElement;
		const titleElement = itemElement?.querySelector<HTMLElement>('[data-item-title-text]');
		if (!itemElement || !titleElement) {
			throw new Error('An item illustration needs an item title.');
		}
		const itemContainer = itemElement;
		const itemTitle = titleElement;

		function updateLayout(): void {
			const titleRectangles = Array.from(itemTitle.getClientRects());
			if (titleRectangles.length === 0) {
				return;
			}

			const titleRight = Math.max(...titleRectangles.map((rectangle) => rectangle.right));
			const illustrationRight = itemContainer.getBoundingClientRect().right - illustrationInset;
			const availableWidth = illustrationRight - titleRight - illustrationGap;
			const layout = itemIllustrationLayout(availableWidth);

			illustrationViewport.style.setProperty('--item-illustration-width', `${layout.width}px`);
			itemTitle.classList.toggle('item-illustration-overlaps', layout.overlapsTitle);
		}

		const resizeObserver = new ResizeObserver(updateLayout);
		resizeObserver.observe(itemContainer);
		resizeObserver.observe(illustrationViewport);
		const titleObserver = new MutationObserver(updateLayout);
		titleObserver.observe(itemTitle, { characterData: true, childList: true, subtree: true });
		updateLayout();

		return () => {
			resizeObserver.disconnect();
			titleObserver.disconnect();
			itemTitle.classList.remove('item-illustration-overlaps');
		};
	});
</script>

<span
	bind:this={illustrationViewport}
	aria-hidden="true"
	class="item-illustration-viewport"
	style={`--item-illustration-height: ${itemIllustrationHeight}px;`}
>
	<Artwork class="item-illustration" name={illustration} />
</span>

<style>
	.item-illustration-viewport {
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		position: absolute;
		z-index: 0;
	}

	:global(.item-illustration) {
		color: var(--item-accent);
		height: var(--item-illustration-height);
		opacity: 0.3;
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%) scaleX(-1);
		width: var(--item-illustration-width, 11rem);
		z-index: 0;
	}

	:global(.item-illustration path),
	:global(.item-illustration circle) {
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
