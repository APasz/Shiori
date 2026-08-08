<script lang="ts">
	import { onMount } from 'svelte';
	import { itineraryIllustration, type ItineraryIllustrationSource } from '$lib/itinerary/illustration';

	const maximumIllustrationWidth = 176;
	const illustrationEdgeBleed = 24;
	const minimumIllustrationWidth = 66;
	const illustrationGap = 8;

	let { item }: { item: ItineraryIllustrationSource } = $props();
	let illustrationElement: HTMLSpanElement;
	let visibleWidth = $state(0);

	const illustration = $derived(itineraryIllustration(item));
	const railWagonCount = $derived(visibleWidth >= 140 ? 3 : visibleWidth >= 104 ? 2 : visibleWidth >= 72 ? 1 : 0);
	const railViewBox = $derived(`0 0 ${42 + railWagonCount * 40} 48`);

	onMount(() => {
		const itemElement = illustrationElement.parentElement?.parentElement;
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
			const illustrationRight = itemContainer.getBoundingClientRect().right + illustrationEdgeBleed;
			const availableWidth = illustrationRight - titleRight - illustrationGap;
			const illustrationWidth = Math.min(maximumIllustrationWidth, Math.max(minimumIllustrationWidth, availableWidth));

			illustrationElement.style.setProperty('--item-illustration-width', `${illustrationWidth}px`);
			itemTitle.classList.toggle('item-illustration-overlaps', availableWidth < minimumIllustrationWidth);
			visibleWidth = illustrationElement.getBoundingClientRect().width;
		}

		const resizeObserver = new ResizeObserver(updateLayout);
		resizeObserver.observe(itemContainer);
		resizeObserver.observe(illustrationElement);
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

<span aria-hidden="true" class="item-illustration-viewport">
	<span bind:this={illustrationElement} class="item-illustration">
		{#if illustration === 'rail'}
			<svg viewBox={railViewBox} preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">
				<g>
					<path d="M4 38V17l7-8h20l7 8v21H4Z" />
					<path d="M4 29h34M12 17h17v12H12zM35 18h3" />
					<path d="m8 38 5 5m17-5-5 5" />
					<circle cx="12" cy="39" r="3" />
					<circle cx="30" cy="39" r="3" />
					{#if railWagonCount >= 1}
						<path d="M42 38V16h30v22H42Z" />
						<path d="M42 29h30M48 20h7v9h-7zM59 20h7v9h-7zM46 43h22" />
						<circle cx="50" cy="39" r="3" />
						<circle cx="66" cy="39" r="3" />
					{/if}
					{#if railWagonCount >= 2}
						<path d="M82 38V16h30v22H82Z" />
						<path d="M82 29h30M88 20h7v9h-7zM99 20h7v9h-7zM86 43h22" />
						<circle cx="90" cy="39" r="3" />
						<circle cx="106" cy="39" r="3" />
					{/if}
					{#if railWagonCount >= 3}
						<path d="M122 38V16h30v22H122Z" />
						<path d="M122 29h30M128 20h7v9h-7zM139 20h7v9h-7zM126 43h22" />
						<circle cx="130" cy="39" r="3" />
						<circle cx="146" cy="39" r="3" />
					{/if}
				</g>
			</svg>
		{:else if illustration === 'air'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M8 31h40l23 9 7-2-15-13h35l14 5 8-2-18-8-34-1-20-11-9 2 13 11H24L14 16l-6 2 8 9-8 4Z" />
				<path class="detail" d="M91 39h16m-7-7h13" />
			</svg>
		{:else if illustration === 'bus'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M18 11h81l9 8v19H18V11Z" />
				<path d="M18 29h90M28 17h12v9H28zM47 17h12v9H47zM66 17h12v9H66zM85 17h12v9H85z" />
				<circle cx="34" cy="39" r="5" />
				<circle cx="92" cy="39" r="5" />
			</svg>
		{:else if illustration === 'car'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M15 33v-9l15-12h43l18 12v9H15Z" />
				<path d="M30 12 21 24h27V12m6 0v12h29l-10-12" />
				<circle cx="31" cy="34" r="5" />
				<circle cx="76" cy="34" r="5" />
				<path d="M16 33v5m75-5v5" />
			</svg>
		{:else if illustration === 'ferry'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M17 33h92l-15 9H33L17 33Z" />
				<path d="M40 33V16h36l14 17M48 16v-8h16v8m-8-8V4" />
				<path class="detail" d="M13 43c8 3 16 3 24 0s16-3 24 0 16 3 24 0 16-3 24 0" />
			</svg>
		{:else if illustration === 'walk'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M36 42c-3-8-1-17 7-22l11-8 7 7-9 8 8 6c4 3 9 4 14 3l18-3 2 8-20 4c-7 1-14-1-19-5l-8-6c-2 4-2 8-1 12" />
				<circle cx="59" cy="8" r="4" />
			</svg>
		{:else if illustration === 'activity'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<circle cx="86" cy="24" r="17" />
				<path d="m86 11 5 13-5 13-5-13 5-13Zm-13 13h26M23 39c17-1 27-8 37-22" />
				<circle cx="21" cy="39" r="3" />
			</svg>
		{:else if illustration === 'accommodation'}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M17 37V15h25v11h67v11H17Z" />
				<path d="M42 26v-9h27c9 0 15 4 15 9M17 37v6m84-6v6M27 26v-7h9v7" />
			</svg>
		{:else}
			<svg viewBox="0 0 128 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
				<path d="M15 35c18 0 20-20 39-20h36" />
				<path d="m82 7 8 8-8 8m8-8h22" />
				<circle cx="15" cy="35" r="4" />
			</svg>
		{/if}
	</span>
</span>

<style>
	.item-illustration-viewport {
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		position: absolute;
		z-index: 0;
	}

	.item-illustration {
		color: var(--item-accent);
		height: 3rem;
		opacity: 0.3;
		position: absolute;
		right: -1.5rem;
		top: 50%;
		transform: translateY(-50%);
		width: var(--item-illustration-width, 11rem);
		z-index: 0;
	}

	svg {
		display: block;
		height: 100%;
		width: 100%;
	}

	path,
	circle {
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.75;
	}

	.detail {
		opacity: 0.65;
	}
</style>
