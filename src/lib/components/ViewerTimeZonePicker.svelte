<script lang="ts">
	import { onMount } from 'svelte';
	import {
		browserTimeZoneOptions,
		timeZoneShortLabel,
		type TimeZoneSearchOption
	} from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import Icon from '$lib/visuals/Icon.svelte';
	import TimeZonePicker from './TimeZonePicker.svelte';

	let pickerElement = $state<HTMLDetailsElement | null>(null);
	let isOpen = $state(false);
	let timeZoneOptions = $state<TimeZoneSearchOption[]>([]);
	const timeZone = $derived(viewerContext.timeZone);
	const timeZoneAbbreviation = $derived(timeZoneShortLabel(timeZone, viewerContext.currentTimestamp));

	function selectTimeZone(selectedTimeZone: string): void {
		viewerContext.setTimeZoneOverride(selectedTimeZone);
		isOpen = false;
	}

	function useBrowserTimeZone(): void {
		viewerContext.clearTimeZoneOverride();
		isOpen = false;
	}

	function synchronizeMenu(event: Event): void {
		if (!(event.currentTarget instanceof HTMLDetailsElement)) {
			throw new Error('The time-zone menu toggle event did not originate from its details element.');
		}

		isOpen = event.currentTarget.open;
		if (isOpen) {
			queueMicrotask(() => {
				if (isOpen) {
					pickerElement?.querySelector<HTMLInputElement>('input')?.focus();
				}
			});
		}
	}

	function closeOnOutsidePointerDown(event: PointerEvent): void {
		if (event.target instanceof Node && !pickerElement?.contains(event.target)) {
			isOpen = false;
		}
	}

	function closeOnEscape(event: KeyboardEvent): void {
		if (
			event.key !== 'Escape' ||
			!isOpen ||
			!(event.target instanceof Node) ||
			!pickerElement?.contains(event.target)
		) {
			return;
		}

		isOpen = false;
		queueMicrotask(() => pickerElement?.querySelector<HTMLElement>('summary')?.focus());
	}

	onMount(() => {
		timeZoneOptions = browserTimeZoneOptions();
	});

	$effect(() => {
		if (!isOpen) {
			return;
		}

		document.addEventListener('pointerdown', closeOnOutsidePointerDown);
		document.addEventListener('keydown', closeOnEscape);
		return () => {
			document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
			document.removeEventListener('keydown', closeOnEscape);
		};
	});
</script>

<details bind:this={pickerElement} bind:open={isOpen} class="viewer-time-zone-picker" ontoggle={synchronizeMenu}>
	<summary aria-label={`View times in ${timeZone}`} title={`View times in ${timeZone}`}>
		<span class="time-zone-name">{timeZone}</span>
		<span aria-hidden="true" class="time-zone-abbreviation">{timeZoneAbbreviation}</span>
		<Icon name="disclosure" size="0.875rem" />
	</summary>
	<div class="time-zone-menu">
		<p>
			{viewerContext.isTimeZoneOverridden ? 'Time zone override' : 'Browser time zone'}
			<span>{timeZone}</span>
		</p>
		<TimeZonePicker
			clearQueryOnFocus
			commitOnBlur={false}
			id="viewer-time-zone"
			label="Choose display time zone"
			onSelect={selectTimeZone}
			options={timeZoneOptions}
			value={timeZone}
		/>
		{#if viewerContext.isTimeZoneOverridden}
			<button onclick={useBrowserTimeZone} type="button">
				Use browser time zone
				<span>{viewerContext.browserTimeZone}</span>
			</button>
		{/if}
	</div>
</details>

<style>
	.viewer-time-zone-picker {
		position: relative;
	}

	summary {
		align-items: center;
		background: transparent;
		border: 1px solid var(--color-border-default);
		border-radius: 0.25rem;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.8125rem;
		gap: 0.375rem;
		min-height: 2.25rem;
		max-width: 13rem;
		padding: 0.375rem 0.5rem;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	summary:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.time-zone-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time-zone-abbreviation {
		display: none;
	}

	.time-zone-menu {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		display: grid;
		gap: 0.5rem;
		padding: 0.625rem;
		position: absolute;
		right: 0;
		top: calc(100% + 0.375rem);
		width: min(21rem, calc(100vw - 2rem));
		z-index: 2;
	}

	p {
		color: var(--color-text-secondary);
		display: grid;
		font-size: 0.6875rem;
		gap: 0.125rem;
		letter-spacing: 0.04em;
		margin: 0;
		text-transform: uppercase;
	}

	p span,
	button span {
		color: var(--color-text-primary);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: normal;
		text-transform: none;
	}

	.time-zone-menu :global(.shiori-form-control) {
		width: 100%;
	}

	button {
		align-items: center;
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		display: flex;
		font: inherit;
		font-size: 0.75rem;
		justify-content: space-between;
		padding: 0.5rem 0.625rem;
		text-align: left;
	}

	button:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	@media (max-width: 48rem) {
		.time-zone-menu {
			left: auto;
			position: fixed;
			right: max(1rem, env(safe-area-inset-right));
			top: var(--trip-topbar-row-height, 3.5rem);
			width: min(21rem, calc(100vw - max(1rem, env(safe-area-inset-left)) - max(1rem, env(safe-area-inset-right))));
		}

		summary {
			min-height: 2.75rem;
			min-width: 2.75rem;
			padding-inline: 0.375rem;
		}

		.time-zone-name {
			display: none;
		}

		.time-zone-abbreviation {
			display: inline;
			font-size: 0.75rem;
			font-weight: 700;
		}
	}
</style>
