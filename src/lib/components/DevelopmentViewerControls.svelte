<script lang="ts">
	import DateTimeInput from '$lib/components/DateTimeInput.svelte';
	import { isOnOrAfterUnixEpoch } from '$lib/itinerary/unix-time';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { formatTimestampForTimeZoneInput, zonedDateTimeToUnixMilliseconds } from '$lib/itinerary/zoned-time';

	let dateTime = $state('');
	let errorMessage = $state<string | null>(null);
	const timeZone = $derived(viewerContext.timeZone);
	const viewerStatus = $derived(
		viewerContext.isSimulated
			? 'Simulation active'
			: viewerContext.isTimeZoneOverridden
				? 'Time zone override active'
				: 'Using browser settings'
	);
	const canResetViewer = $derived(viewerContext.isSimulated || viewerContext.isTimeZoneOverridden);

	function changeDateTime(value: string): void {
		dateTime = value;
		errorMessage = null;
	}

	function apply(): void {
		const timestamp = zonedDateTimeToUnixMilliseconds(dateTime, timeZone);
		if (timestamp === null) {
			errorMessage = 'Choose a complete, valid local date and time.';
			return;
		}
		if (!isOnOrAfterUnixEpoch(timestamp)) {
			errorMessage = 'Choose a time on or after the Unix epoch.';
			return;
		}
		errorMessage = null;
		viewerContext.setSimulated(timestamp);
	}

	function reset(): void {
		viewerContext.resetToBrowser();
		errorMessage = null;
	}

	$effect(() => {
		void viewerContext.revision;
		dateTime = formatTimestampForTimeZoneInput(viewerContext.currentTimestamp, timeZone) ?? '';
	});
</script>

<aside class="development-controls">
	<details>
		<summary>Development viewer</summary>
		<div class="controls">
			<p>
				Stage a viewer-local date and time in the top-bar time zone. This changes only client-side presentation and
				new-item defaults; persisted timestamps remain unchanged.
			</p>
			<DateTimeInput
				{dateTime}
				dialogPlacement="above-development-controls"
				id="development-viewer-time"
				label="Viewer date and time"
				onDateTimeChange={changeDateTime}
				pickerPresentation="dialog"
				showTimeZonePicker={false}
				{timeZone}
			/>
			{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
			<div class="actions">
				<span>{viewerStatus}</span>
				<button onclick={apply} type="button">Apply viewer settings</button>
				<button disabled={!canResetViewer} onclick={reset} type="button"> Reset to browser </button>
			</div>
		</div>
	</details>
</aside>

<style>
	.development-controls {
		bottom: 1rem;
		left: 1rem;
		position: fixed;
		width: min(36rem, calc(100vw - 2rem));
		z-index: 2;
	}

	details {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-state-warning);
		box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--color-overlay-backdrop) 40%, transparent);
		max-height: calc(100dvh - 2rem);
		overscroll-behavior: contain;
		overflow-y: auto;
	}

	summary {
		background: var(--color-surface-raised);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.5rem 0.75rem;
		position: sticky;
		top: 0;
		text-transform: uppercase;
		z-index: 1;
	}

	.controls {
		display: grid;
		gap: 0.875rem;
		padding: 0 0.75rem 0.75rem;
	}

	p {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		margin: 0;
	}

	.actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		font-size: 0.75rem;
		gap: 0.75rem;
	}

	.actions span {
		color: var(--color-state-warning);
		font-weight: 700;
	}

	button {
		appearance: none;
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0.25rem 0.5rem;
	}

	button:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.error {
		color: var(--color-state-error);
	}
</style>
