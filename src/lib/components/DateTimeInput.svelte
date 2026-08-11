<script lang="ts">
	import { tick } from 'svelte';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import TimeZonePicker from '$lib/components/TimeZonePicker.svelte';
	import { draggableDialog } from '$lib/components/draggable-dialog';
	import {
		addCalendarMonths,
		calendarDays,
		calendarMonthForDate,
		currentCalendarMonth,
		formatCalendarDate,
		formatCalendarMonth,
		type CalendarMonth
	} from '$lib/itinerary/calendar';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { formatTimestampForTimeZoneInput } from '$lib/itinerary/zoned-time';
	import type { TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';

	type PickerPresentation = 'popover' | 'dialog';
	type DialogPlacement = 'center' | 'above-development-controls';
	type PickerMode = 'date-time' | 'date' | 'time';
	type DialogPosition = Readonly<{
		left: number;
		top: number;
	}>;

	const dialogViewportInset = 16;
	const developmentControlsGap = 12;

	let {
		id,
		dateTime,
		label,
		pickerMode = 'date-time',
		dialogPlacement = 'center',
		pickerPresentation = 'popover',
		timeZoneHint = 'Used to interpret this value; not saved.',
		timeZone,
		timeZoneOptions,
		onDateTimeChange,
		onTimeZoneChange
	}: {
		id: string;
		dateTime: string;
		label: string;
		pickerMode?: PickerMode;
		dialogPlacement?: DialogPlacement;
		pickerPresentation?: PickerPresentation;
		timeZoneHint?: string;
		timeZone: string;
		timeZoneOptions: TimeZoneSearchOption[];
		onDateTimeChange: (value: string) => void;
		onTimeZoneChange: (timeZone: string) => void;
	} = $props();
	let pickerElement: HTMLDivElement;
	let dialogElement = $state<HTMLDialogElement>();
	let dialogPosition = $state<DialogPosition | null>(null);
	let triggerElement: HTMLButtonElement;
	let isOpen = $state(false);
	let visibleMonth = $state<CalendarMonth>(currentCalendarMonth());

	const days = $derived(calendarDays(visibleMonth));
	const today = $derived(formatTimestampForTimeZoneInput(viewerContext.currentTimestamp, timeZone)?.slice(0, 10) ?? '');

	function datePart(value: string): string {
		return value.slice(0, 10);
	}

	function timePart(value: string): string {
		return value.slice(11);
	}

	function replaceDatePart(value: string, date: string): string {
		return `${date}T${timePart(value)}`;
	}

	function replaceTimePart(value: string, time: string): string {
		return `${datePart(value)}T${time}`;
	}

	function selectedLabel(value: string): string {
		const date = formatCalendarDate(datePart(value));
		const time = timePart(value);
		if (pickerMode === 'date') {
			return date ?? 'Select date';
		}
		if (pickerMode === 'time') {
			return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : 'Select time';
		}
		return date && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
			? `${date} · ${time}`
			: date
				? `${date} · Select time`
				: 'Select date and time';
	}

	$effect(() => {
		if (!isOpen) {
			const selectedMonth = calendarMonthForDate(datePart(dateTime)) ?? calendarMonthForDate(today);
			if (selectedMonth) {
				visibleMonth = selectedMonth;
			}
		}
	});

	async function openPicker(): Promise<void> {
		const selectedMonth = calendarMonthForDate(datePart(dateTime)) ?? calendarMonthForDate(today);
		if (selectedMonth) {
			visibleMonth = selectedMonth;
		}
		isOpen = true;

		if (pickerPresentation === 'dialog') {
			dialogPosition = null;
			await tick();
			const dialog = dialogElement;
			if (isOpen && dialog && !dialog.open) {
				dialog.showModal();
				positionDialog(dialog);
			}
		}
	}

	function clamp(value: number, minimum: number, maximum: number): number {
		return Math.min(Math.max(value, minimum), maximum);
	}

	function positionDialog(dialog: HTMLDialogElement): void {
		if (dialogPlacement !== 'above-development-controls') {
			return;
		}

		const controls = pickerElement.closest<HTMLElement>('.development-controls');
		if (!controls) {
			return;
		}

		const controlsBounds = controls.getBoundingClientRect();
		const dialogBounds = dialog.getBoundingClientRect();
		const maximumLeft = Math.max(dialogViewportInset, window.innerWidth - dialogBounds.width - dialogViewportInset);
		const maximumTop = Math.max(dialogViewportInset, window.innerHeight - dialogBounds.height - dialogViewportInset);
		dialogPosition = {
			left: clamp(controlsBounds.left, dialogViewportInset, maximumLeft),
			top: clamp(controlsBounds.top - dialogBounds.height - developmentControlsGap, dialogViewportInset, maximumTop)
		};
	}

	function dialogStyle(): string | undefined {
		if (!dialogPosition) {
			return undefined;
		}
		return `inset: auto; left: ${dialogPosition.left}px; margin: 0; position: fixed; top: ${dialogPosition.top}px;`;
	}

	function closeAfterFocusChange(): void {
		setTimeout(() => {
			if (!pickerElement.contains(document.activeElement)) {
				isOpen = false;
			}
		}, 0);
	}

	function closePicker(): void {
		if (pickerPresentation === 'dialog' && dialogElement?.open) {
			dialogElement.close();
		}
		isOpen = false;
		triggerElement.focus();
	}

	function handleDialogClose(): void {
		isOpen = false;
		triggerElement.focus();
	}

	function handleDialogCancel(event: Event): void {
		event.preventDefault();
		closePicker();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			closePicker();
		}
	}
</script>

{#snippet pickerContent()}
	{#if pickerMode !== 'time'}
		<div class="calendar-header" data-dialog-drag-handle>
			<button
				aria-label="Previous month"
				onclick={() => (visibleMonth = addCalendarMonths(visibleMonth, -1))}
				type="button"
			>
				‹
			</button>
			<strong aria-live="polite">{formatCalendarMonth(visibleMonth)}</strong>
			<button aria-label="Next month" onclick={() => (visibleMonth = addCalendarMonths(visibleMonth, 1))} type="button">
				›
			</button>
		</div>
	{/if}
	<div class:date-only={pickerMode === 'date'} class:time-only={pickerMode === 'time'} class="picker-body">
		{#if pickerMode !== 'time'}
			<div class="calendar">
				<div aria-hidden="true" class="weekdays">
					<span>Mon</span>
					<span>Tue</span>
					<span>Wed</span>
					<span>Thu</span>
					<span>Fri</span>
					<span>Sat</span>
					<span>Sun</span>
				</div>
				<div aria-label={formatCalendarMonth(visibleMonth)} class="days">
					{#each days as day (day.date)}
						<button
							aria-current={day.date === today ? 'date' : undefined}
							aria-label={formatCalendarDate(day.date) ?? day.date}
							aria-pressed={day.date === datePart(dateTime)}
							class:outside-month={!day.inCurrentMonth}
							class:selected={day.date === datePart(dateTime)}
							onclick={() => onDateTimeChange(replaceDatePart(dateTime, day.date))}
							type="button"
						>
							{day.day}
						</button>
					{/each}
				</div>
			</div>
		{/if}
		{#if pickerMode !== 'date'}
			<div class="time-panel">
				<strong>Time</strong>
				<span class="field-hint">24-hour time</span>
				<TimePicker
					id={`${id}-time`}
					onChange={(time) => onDateTimeChange(replaceTimePart(dateTime, time))}
					value={timePart(dateTime)}
				/>
			</div>
		{/if}
	</div>
	<div class="picker-actions">
		<button onclick={closePicker} type="button">Done</button>
	</div>
{/snippet}

<div class="date-time-grid">
	<div bind:this={pickerElement} class="date-time-picker shiori-form-label" onfocusout={closeAfterFocusChange}>
		<span>
			{label}
			{#if pickerMode === 'time' && formatCalendarDate(datePart(dateTime))}
				<span class="field-hint">Date fixed as {formatCalendarDate(datePart(dateTime))}</span>
			{/if}
		</span>
		<button
			aria-expanded={isOpen}
			aria-haspopup="dialog"
			aria-label={`Select ${label}: ${selectedLabel(dateTime)}`}
			bind:this={triggerElement}
			class="date-time-trigger shiori-form-control"
			{id}
			onclick={openPicker}
			onkeydown={handleKeydown}
			type="button"
		>
			<span>{selectedLabel(dateTime)}</span>
			<span aria-hidden="true">⌄</span>
		</button>
		{#if isOpen}
			{#if pickerPresentation === 'dialog'}
				<dialog
					aria-label={`Choose ${label}`}
					bind:this={dialogElement}
					class="picker-panel picker-dialog"
					style={dialogStyle()}
					use:draggableDialog={{ handleSelector: '[data-dialog-drag-handle]' }}
					oncancel={handleDialogCancel}
					onclose={handleDialogClose}
					onkeydown={handleKeydown}
				>
					{@render pickerContent()}
				</dialog>
			{:else}
				<div aria-label={`Choose ${label}`} class="picker-panel" onkeydown={handleKeydown} role="dialog" tabindex="-1">
					{@render pickerContent()}
				</div>
			{/if}
		{/if}
	</div>
	<div class="shiori-form-label">
		<label for={`${id}-time-zone`}>Time zone <span class="field-hint">{timeZoneHint}</span></label>
		<TimeZonePicker id={`${id}-time-zone`} onSelect={onTimeZoneChange} options={timeZoneOptions} value={timeZone} />
	</div>
</div>

<style>
	.date-time-grid {
		display: grid;
		gap: 0.875rem;
		grid-template-columns: minmax(15rem, 1fr) minmax(13rem, 1.25fr);
	}

	.date-time-picker {
		container-name: date-time-picker;
		container-type: inline-size;
		position: relative;
	}

	.date-time-trigger {
		align-items: center;
		display: flex;
		justify-content: space-between;
		text-align: left;
	}

	.picker-panel {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--color-overlay-backdrop) 40%, transparent);
		left: 0;
		padding: 0.875rem;
		position: absolute;
		top: calc(100% + 0.25rem);
		width: min(40rem, 100cqi, calc(100vw - 4rem));
		z-index: 3;
	}

	.picker-dialog {
		color: var(--color-text-primary);
		margin: auto;
		max-height: calc(100dvh - 2rem);
		max-width: calc(100vw - 2rem);
		overflow-y: auto;
		width: min(40rem, calc(100vw - 2rem));
	}

	.picker-dialog::backdrop {
		background: color-mix(in srgb, var(--color-overlay-backdrop) 70%, transparent);
	}

	.calendar-header {
		align-items: center;
		display: grid;
		gap: 0.5rem;
		grid-template-columns: 2rem 1fr 2rem;
		margin-bottom: 0.75rem;
		text-align: center;
	}

	.calendar-header button,
	.days button,
	.picker-actions button {
		appearance: none;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
	}

	.calendar-header button {
		font-size: 1.5rem;
		line-height: 1;
		min-height: 2rem;
	}

	.picker-body {
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr) minmax(13rem, 0.75fr);
	}

	.picker-body.date-only {
		grid-template-columns: minmax(0, 1fr);
	}

	.picker-body.time-only {
		grid-template-columns: minmax(13rem, 1fr);
	}

	.weekdays,
	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}

	.weekdays {
		color: var(--color-text-muted);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		margin-bottom: 0.25rem;
		text-align: center;
		text-transform: uppercase;
	}

	.days button {
		aspect-ratio: 1;
		font-variant-numeric: tabular-nums;
		padding: 0;
	}

	.days button:hover,
	.days button:focus-visible,
	.calendar-header button:hover,
	.calendar-header button:focus-visible,
	.picker-actions button:hover,
	.picker-actions button:focus-visible {
		background: var(--color-surface-subtle);
		border-color: var(--color-state-focus);
		outline: 0;
	}

	.days button.selected {
		background: var(--color-state-selection);
		border-color: var(--color-state-selection);
		color: var(--color-text-on-accent);
	}

	.days button.outside-month {
		color: var(--color-text-muted);
	}

	.days button[aria-current='date'] {
		box-shadow: inset 0 -2px 0 var(--color-state-focus);
	}

	.time-panel {
		border-left: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.5rem;
		padding-left: 1rem;
		place-items: start;
	}

	.picker-actions {
		border-top: 1px solid var(--color-border-default);
		display: flex;
		justify-content: end;
		margin-top: 0.875rem;
		padding-top: 0.75rem;
	}

	.picker-actions button {
		border-color: var(--color-state-selection);
		padding: 0.375rem 0.625rem;
	}

	.field-hint {
		color: var(--color-text-muted);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	@media (max-width: 40rem) {
		.picker-body {
			grid-template-columns: 1fr;
		}

		.time-panel {
			border-left: 0;
			border-top: 1px solid var(--color-border-default);
			padding-left: 0;
			padding-top: 0.75rem;
			place-items: center;
		}
	}

	@container date-time-picker (max-width: 32rem) {
		.picker-body {
			grid-template-columns: 1fr;
		}

		.time-panel {
			border-left: 0;
			border-top: 1px solid var(--color-border-default);
			padding-left: 0;
			padding-top: 0.75rem;
			place-items: center;
		}
	}

	@media (max-width: 32rem) {
		.date-time-grid {
			grid-template-columns: 1fr;
		}

		.picker-panel {
			width: min(21rem, calc(100vw - 3rem));
		}
	}
</style>
