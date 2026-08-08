<script lang="ts">
	import { tick } from 'svelte';

	type TimeParts = Readonly<{
		hours: string;
		minutes: string;
	}>;
	type ClockSelection = 'hours' | 'minutes';

	const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
	const minuteOptions = Array.from({ length: 12 }, (_, minute) => minute * 5);

	let {
		id,
		value,
		onChange
	}: {
		id: string;
		value: string;
		onChange: (time: string) => void;
	} = $props();
	let hours = $state('');
	let minutes = $state('');
	let clockSelection = $state<ClockSelection>('hours');
	let clockFace: HTMLDivElement;

	function timeParts(time: string): TimeParts {
		const [nextHours = '', nextMinutes = ''] = time.split(':', 2);
		return { hours: nextHours, minutes: nextMinutes };
	}

	function setTime(nextHours: string, nextMinutes: string): void {
		hours = nextHours;
		minutes = nextMinutes;
		onChange(`${nextHours}:${nextMinutes}`);
	}

	function padded(value: number): string {
		return String(value).padStart(2, '0');
	}

	function numericInput(value: string): string {
		return value.replaceAll(/\D/g, '').slice(0, 2);
	}

	function normalize(): void {
		if (!/^\d{1,2}$/.test(hours) || !/^\d{1,2}$/.test(minutes)) {
			return;
		}

		const hour = Number(hours);
		const minute = Number(minutes);
		if (hour > 23 || minute > 59) {
			return;
		}
		setTime(String(hour).padStart(2, '0'), String(minute).padStart(2, '0'));
	}

	function increment(value: string, maximum: number, amount: number): string {
		const current = /^\d{1,2}$/.test(value) ? Number(value) : 0;
		return padded((current + amount + maximum + 1) % (maximum + 1));
	}

	async function selectHour(hour: number): Promise<void> {
		setTime(padded(hour), minutes);
		clockSelection = 'minutes';
		await tick();
		const selectedMinute = clockFace.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
		(selectedMinute ?? clockFace.querySelector<HTMLButtonElement>('button'))?.focus();
	}

	function selectMinute(minute: number): void {
		setTime(hours, padded(minute));
	}

	function optionPosition(index: number, length: number): string {
		const angle = (index / length) * Math.PI * 2 - Math.PI / 2;
		const radius = 42;
		return `--clock-x: ${50 + Math.cos(angle) * radius}%; --clock-y: ${50 + Math.sin(angle) * radius}%;`;
	}

	function clockAngle(): number {
		const value = clockSelection === 'hours' ? Number(hours) : Number(minutes);
		const count = clockSelection === 'hours' ? 24 : 60;
		return Number.isInteger(value) && value >= 0 ? (value / count) * 360 : 0;
	}

	function handleHoursKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			setTime(increment(hours, 23, event.key === 'ArrowUp' ? 1 : -1), minutes);
		}
	}

	function handleMinutesKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			setTime(hours, increment(minutes, 59, event.key === 'ArrowUp' ? 1 : -1));
		}
	}

	$effect(() => {
		const next = timeParts(value);
		hours = next.hours;
		minutes = next.minutes;
	});
</script>

<div class="time-picker">
	<div class="clock-mode" role="group" aria-label="Clock selection">
		<button
			aria-pressed={clockSelection === 'hours'}
			class:selected={clockSelection === 'hours'}
			onclick={() => (clockSelection = 'hours')}
			type="button"
		>
			Hours
		</button>
		<button
			aria-pressed={clockSelection === 'minutes'}
			class:selected={clockSelection === 'minutes'}
			onclick={() => (clockSelection = 'minutes')}
			type="button"
		>
			Minutes
		</button>
	</div>
	<div bind:this={clockFace} class="clock-face" aria-label="24-hour clock" role="group">
		<span aria-hidden="true" class="clock-hand" style={`--clock-angle: ${clockAngle()}deg`}></span>
		<span aria-live="polite" class="clock-value">{hours || 'HH'}:{minutes || 'MM'}</span>
		{#if clockSelection === 'hours'}
			{#each hourOptions as hour (hour)}
				<button
					aria-label={`Set hour to ${padded(hour)}, 24-hour time`}
					aria-pressed={Number(hours) === hour}
					class:selected={Number(hours) === hour}
					onclick={() => void selectHour(hour)}
					style={optionPosition(hour, hourOptions.length)}
					type="button"
				>
					{padded(hour)}
				</button>
			{/each}
		{:else}
			{#each minuteOptions as minute (minute)}
				<button
					aria-label={`Set minutes to ${padded(minute)}`}
					aria-pressed={Number(minutes) === minute}
					class:selected={Number(minutes) === minute}
					onclick={() => selectMinute(minute)}
					style={optionPosition(minute / 5, minuteOptions.length)}
					type="button"
				>
					{padded(minute)}
				</button>
			{/each}
		{/if}
	</div>
	<div class="time-inputs" aria-label="Enter a precise 24-hour time">
		<input
			aria-label="Hours, 24-hour time"
			aria-valuemax="23"
			aria-valuemin="0"
			class="time-segment"
			{id}
			inputmode="numeric"
			maxlength="2"
			placeholder="HH"
			role="spinbutton"
			value={hours}
			onblur={normalize}
			oninput={(event) => setTime(numericInput(event.currentTarget.value), minutes)}
			onkeydown={handleHoursKeydown}
		/>
		<span aria-hidden="true">:</span>
		<input
			aria-label="Minutes"
			aria-valuemax="59"
			aria-valuemin="0"
			class="time-segment"
			id={`${id}-minutes`}
			inputmode="numeric"
			maxlength="2"
			placeholder="MM"
			role="spinbutton"
			value={minutes}
			onblur={normalize}
			oninput={(event) => setTime(hours, numericInput(event.currentTarget.value))}
			onkeydown={handleMinutesKeydown}
		/>
	</div>
</div>

<style>
	.time-picker {
		display: grid;
		gap: 0.5rem;
	}

	.clock-mode,
	.time-inputs {
		align-items: center;
		display: grid;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.clock-mode {
		gap: 0.25rem;
		grid-template-columns: repeat(2, 1fr);
	}

	.clock-mode button,
	.clock-face button {
		appearance: none;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
	}

	.clock-mode button {
		color: var(--color-text-muted);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.25rem;
		text-transform: uppercase;
	}

	.clock-mode button.selected {
		border-color: var(--color-state-selection);
		color: inherit;
	}

	.clock-face {
		aspect-ratio: 1;
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border-default);
		border-radius: 50%;
		position: relative;
		width: min(100%, 13rem);
	}

	.clock-face button {
		align-items: center;
		display: flex;
		font-size: 0.625rem;
		height: 1.5rem;
		justify-content: center;
		left: var(--clock-x);
		position: absolute;
		top: var(--clock-y);
		transform: translate(-50%, -50%);
		width: 1.5rem;
	}

	.clock-face button:hover,
	.clock-face button:focus-visible,
	.clock-mode button:hover,
	.clock-mode button:focus-visible {
		border-color: var(--color-state-focus);
		outline: 0;
	}

	.clock-face button.selected {
		background: var(--color-state-selection);
		border-color: var(--color-state-selection);
		border-radius: 50%;
		color: var(--color-text-on-accent);
	}

	.clock-hand {
		background: var(--color-state-selection);
		bottom: 50%;
		height: 35%;
		left: calc(50% - 1px);
		pointer-events: none;
		position: absolute;
		transform: rotate(var(--clock-angle));
		transform-origin: bottom;
		width: 2px;
	}

	.clock-value {
		align-items: center;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		border-radius: 50%;
		display: flex;
		font-size: 0.75rem;
		height: 3.5rem;
		justify-content: center;
		left: 50%;
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 3.5rem;
	}

	.time-inputs {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		gap: 0.125rem;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		min-height: 2.25rem;
		padding: 0 0.25rem;
	}

	.time-inputs:focus-within {
		border-color: var(--color-state-focus);
		outline: 2px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.time-segment {
		appearance: none;
		background: transparent;
		border: 0;
		color: inherit;
		font: inherit;
		min-width: 0;
		outline: 0;
		padding: 0.375rem 0;
		text-align: center;
	}

	.time-segment::placeholder {
		color: var(--color-text-muted);
		opacity: 1;
	}
</style>
