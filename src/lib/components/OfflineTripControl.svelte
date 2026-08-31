<script lang="ts">
	import { onMount } from 'svelte';
	import { currentTripOfflineCacheStatus, saveCurrentTripForOffline, type OfflineTripCacheStatus } from '$lib/offline';

	let { isOffline }: { isOffline: boolean } = $props();

	let cacheStatus = $state<OfflineTripCacheStatus | null>(null);
	let saving = $state(false);
	let tooltipVisible = $state(false);

	const hasSavedTrip = $derived(cacheStatus?.supported === true && cacheStatus.cached);
	const saveIsUnavailable = $derived(saving || isOffline || cacheStatus === null || cacheStatus.supported === false);
	const unavailableReason = $derived.by((): string | null => {
		if (saving) {
			return 'Saving this trip for offline use';
		}
		if (isOffline) {
			return 'Connect to the internet to save this trip for offline use';
		}
		if (cacheStatus === null) {
			return 'Checking whether offline saving is available';
		}
		if (!cacheStatus.supported) {
			return 'This browser cannot save the itinerary for offline viewing';
		}
		return null;
	});

	async function refreshStatus(): Promise<void> {
		cacheStatus = await currentTripOfflineCacheStatus();
	}

	async function saveForOffline(): Promise<void> {
		saving = true;
		try {
			cacheStatus = await saveCurrentTripForOffline();
		} finally {
			saving = false;
		}
	}

	function showTooltipForMouse(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && saveIsUnavailable) {
			tooltipVisible = true;
		}
	}

	function hideTooltipForMouse(event: PointerEvent): void {
		if (event.pointerType === 'mouse') {
			tooltipVisible = false;
		}
	}

	function handleButtonClick(): void {
		if (saveIsUnavailable) {
			tooltipVisible = true;
			return;
		}

		void saveForOffline();
	}

	function showTooltipOnFocus(): void {
		if (saveIsUnavailable) {
			tooltipVisible = true;
		}
	}

	function hideTooltipOnBlur(): void {
		tooltipVisible = false;
	}

	$effect(() => {
		if (!saveIsUnavailable) {
			tooltipVisible = false;
		}
	});

	onMount(() => {
		const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
		void refreshStatus();
		window.addEventListener('online', refreshStatus);
		serviceWorker?.addEventListener('controllerchange', refreshStatus);
		return () => {
			window.removeEventListener('online', refreshStatus);
			serviceWorker?.removeEventListener('controllerchange', refreshStatus);
		};
	});
</script>

<span class="offline-trip-control">
	<button
		aria-describedby={tooltipVisible ? 'offline-access-unavailable-reason' : undefined}
		aria-disabled={saveIsUnavailable}
		class:unavailable={saveIsUnavailable}
		onblur={hideTooltipOnBlur}
		onclick={handleButtonClick}
		onfocus={showTooltipOnFocus}
		onpointerenter={showTooltipForMouse}
		onpointerleave={hideTooltipForMouse}
		type="button"
	>
		{#if saving}
			Saving for offline…
		{:else if hasSavedTrip}
			Update offline copy
		{:else}
			Save for offline
		{/if}
	</button>
	{#if tooltipVisible && unavailableReason}
		<span class="unavailable-reason" id="offline-access-unavailable-reason" role="tooltip">
			{unavailableReason}
		</span>
	{/if}
</span>

<style>
	.offline-trip-control {
		display: block;
		position: relative;
	}

	button {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		display: block;
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.5rem 0.625rem;
		text-align: left;
		width: 100%;
	}

	button.unavailable {
		color: var(--color-text-muted);
		cursor: not-allowed;
		opacity: 0.65;
	}

	button:not(.unavailable):hover {
		background: var(--color-surface-subtle);
	}

	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.unavailable-reason {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		bottom: 0;
		box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--color-overlay-backdrop) 28%, transparent);
		color: var(--color-text-primary);
		font-size: 0.75rem;
		line-height: 1.35;
		padding: 0.5rem 0.625rem;
		position: absolute;
		right: calc(100% + 0.5rem);
		width: min(16rem, calc(100vw - 3rem));
		z-index: 2;
	}

	@media (max-width: 40rem) {
		.unavailable-reason {
			bottom: max(1rem, env(safe-area-inset-bottom));
			left: max(1rem, env(safe-area-inset-left));
			position: fixed;
			right: max(1rem, env(safe-area-inset-right));
			width: auto;
		}
	}
</style>
