<script lang="ts">
	import { TimeField } from 'bits-ui';
	import { parseTime, type Time } from '@internationalized/date';
	import { defaultFormatPreferences, formatTime, type TimeFormat } from '$lib/format-preferences';
	import Icon from '$lib/visuals/Icon.svelte';
	import { adjustLocalTimeHour, isLocalTime, quickTimes, type HourAdjustment } from './time-picker';

	let {
		disabled = false,
		id,
		label,
		showQuickTimes = true,
		timeFormat = defaultFormatPreferences.timeFormat,
		value,
		onChange
	}: {
		disabled?: boolean;
		id: string;
		label?: string;
		showQuickTimes?: boolean;
		timeFormat?: TimeFormat;
		value: string;
		onChange: (time: string) => void;
	} = $props();
	const hourCycle = $derived(timeFormat === 'twelve-hour' ? 12 : 24);
	const canAdjustHour = $derived(!disabled && isLocalTime(value));

	function parsedTime(value: string): Time | undefined {
		if (!isLocalTime(value)) {
			return undefined;
		}
		try {
			return parseTime(value);
		} catch {
			return undefined;
		}
	}

	function setTime(value: Time | undefined): void {
		if (disabled) {
			return;
		}
		onChange(value?.toString().slice(0, 5) ?? '');
	}

	function adjustHour(adjustment: HourAdjustment): void {
		if (disabled) {
			return;
		}

		const adjustedTime = adjustLocalTimeHour(value, adjustment);
		if (adjustedTime !== null) {
			onChange(adjustedTime);
		}
	}
</script>

<div class="time-picker">
	<div class="time-entry">
		<TimeField.Root {disabled} {hourCycle} onValueChange={setTime} value={parsedTime(value)}>
			<TimeField.Input aria-label={label ?? 'Time'} class="shiori-form-control time-field" {id}>
				{#snippet children({ segments })}
					{#each segments as { part, value: segmentValue }, index (`${part}-${index}`)}
						<TimeField.Segment class={part === 'literal' ? 'literal' : undefined} {part}>
							{segmentValue}
						</TimeField.Segment>
					{/each}
				{/snippet}
			</TimeField.Input>
		</TimeField.Root>
		<div aria-label="Hour controls" class="hour-controls" role="group">
			<button aria-label="Increase hour" disabled={!canAdjustHour} onclick={() => adjustHour(1)} type="button">
				<Icon name="increment" />
			</button>
			<button aria-label="Decrease hour" disabled={!canAdjustHour} onclick={() => adjustHour(-1)} type="button">
				<Icon name="decrement" />
			</button>
		</div>
	</div>
	{#if showQuickTimes}
		<div aria-label="Common times" class="quick-times" role="group">
			{#each quickTimes as time (time)}
				<button
					aria-pressed={value === time}
					class:selected={value === time}
					{disabled}
					onclick={() => onChange(time)}
					type="button"
				>
					{formatTime(time, timeFormat)}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.time-picker {
		display: grid;
		gap: 0.5rem;
	}

	.time-entry {
		position: relative;
	}

	:global(.time-field) {
		align-items: center;
		display: flex;
		font-variant-numeric: tabular-nums;
		gap: 0.0625rem;
		min-height: 2.375rem;
		padding-right: 3.5rem;
	}

	:global(.time-field [data-time-field-segment]) {
		border-radius: 0.1875rem;
		padding: 0.1875rem 0.25rem;
	}

	:global(.time-field [data-time-field-segment]:not([data-segment='literal'])) {
		cursor: text;
	}

	:global(.time-field [data-time-field-segment]:not([data-segment='literal']):focus-visible) {
		background: var(--color-surface-subtle);
		outline: 2px solid var(--color-state-focus);
		outline-offset: 0;
	}

	:global(.time-field [data-time-field-segment][aria-valuetext='Empty']) {
		color: var(--color-text-muted);
	}

	:global(.time-field [data-time-field-segment][data-segment='literal']) {
		color: var(--color-text-muted);
	}

	.hour-controls {
		bottom: 1px;
		border-left: 1px solid var(--color-border-strong);
		display: grid;
		grid-template-rows: repeat(2, minmax(0, 1fr));
		position: absolute;
		right: 1px;
		top: 1px;
		width: 2.75rem;
	}

	.hour-controls button {
		appearance: none;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		display: grid;
		place-items: center;
		padding: 0;
	}

	.hour-controls button + button {
		border-top: 1px solid var(--color-border-strong);
	}

	.hour-controls button:hover:not(:disabled),
	.hour-controls button:focus-visible {
		background: var(--color-surface-subtle);
		outline: 2px solid var(--color-state-focus);
		outline-offset: -2px;
	}

	.hour-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.quick-times {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.quick-times button {
		background: transparent;
		border: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		padding: 0.25rem 0.5rem;
	}

	.quick-times button:hover,
	.quick-times button:focus-visible,
	.quick-times button.selected {
		border-color: var(--color-state-selection);
	}

	.quick-times button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.quick-times button.selected {
		background: var(--color-state-selection);
		color: var(--color-text-on-accent);
	}

	@media (max-width: 40rem) {
		.quick-times button {
			min-height: 2.75rem;
		}
	}
</style>
