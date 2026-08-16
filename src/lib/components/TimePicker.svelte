<script lang="ts">
	import { TimeField } from 'bits-ui';
	import { parseTime, type Time } from '@internationalized/date';

	const quickTimes = ['09:00', '12:00', '15:00', '18:00'] as const;
	const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

	let {
		id,
		label,
		value,
		onChange
	}: {
		id: string;
		label?: string;
		value: string;
		onChange: (time: string) => void;
	} = $props();

	function parsedTime(value: string): Time | undefined {
		if (!localTimePattern.test(value)) {
			return undefined;
		}
		try {
			return parseTime(value);
		} catch {
			return undefined;
		}
	}

	function setTime(value: Time | undefined): void {
		onChange(value?.toString().slice(0, 5) ?? '');
	}
</script>

<div class="time-picker">
	<TimeField.Root hourCycle={24} onValueChange={setTime} value={parsedTime(value)}>
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
	<div aria-label="Common times" class="quick-times" role="group">
		{#each quickTimes as time (time)}
			<button
				aria-pressed={value === time}
				class:selected={value === time}
				onclick={() => onChange(time)}
				type="button"
			>
				{time}
			</button>
		{/each}
	</div>
</div>

<style>
	.time-picker {
		display: grid;
		gap: 0.5rem;
	}

	:global(.time-field) {
		align-items: center;
		display: flex;
		font-variant-numeric: tabular-nums;
		gap: 0.0625rem;
		min-height: 2.375rem;
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
