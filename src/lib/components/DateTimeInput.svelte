<script lang="ts">
	import { onMount } from 'svelte';
	import { DatePicker } from 'bits-ui';
	import { parseDate, today, type CalendarDate, type DateValue } from '@internationalized/date';
	import './date-picker.css';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import TimeZonePicker from '$lib/components/TimeZonePicker.svelte';
	import { formatCalendarDate } from '$lib/itinerary/calendar';
	import type { TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import Icon from '$lib/visuals/Icon.svelte';

	type PickerPresentation = 'popover' | 'dialog';
	type DialogPlacement = 'center' | 'above-development-controls';
	type PickerMode = 'date-time' | 'date' | 'time';

	const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;

	let {
		id,
		dateTime,
		label,
		minimumDate,
		pickerMode = 'date-time',
		dialogPlacement: _dialogPlacement = 'center',
		pickerPresentation = 'popover',
		portalTarget,
		showTimeZonePicker = true,
		timeZoneHint = 'Used to interpret this value; not saved.',
		timeZone = 'UTC',
		timeZoneOptions = [],
		onDateTimeChange,
		onTimeZoneChange = () => undefined
	}: {
		id: string;
		dateTime: string;
		label: string;
		minimumDate?: string;
		pickerMode?: PickerMode;
		dialogPlacement?: DialogPlacement;
		pickerPresentation?: PickerPresentation;
		portalTarget?: HTMLElement;
		showTimeZonePicker?: boolean;
		timeZoneHint?: string;
		timeZone?: string;
		timeZoneOptions?: TimeZoneSearchOption[];
		onDateTimeChange: (value: string) => void;
		onTimeZoneChange?: (timeZone: string) => void;
	} = $props();
	let locale = $state('en-AU');

	const dateValue = $derived(calendarDate(datePart(dateTime)));
	const minimumDateValue = $derived(calendarDate(minimumDate ?? ''));
	const calendarPlaceholder = $derived(dateValue ?? today(timeZone));
	const calendarContentClass = $derived(
		`calendar-content${pickerPresentation === 'dialog' ? ` calendar-dialog ${_dialogPlacement}` : ''}`
	);

	onMount(() => {
		locale = navigator.language || locale;
	});

	function datePart(value: string): string {
		return value.slice(0, 10);
	}

	function timePart(value: string): string {
		return value.slice(11);
	}

	function calendarDate(value: string): CalendarDate | undefined {
		if (!calendarDatePattern.test(value)) {
			return undefined;
		}
		try {
			return parseDate(value);
		} catch {
			return undefined;
		}
	}

	function replaceDatePart(value: string, date: string): string {
		return `${date}T${timePart(value)}`;
	}

	function replaceTimePart(value: string, time: string): string {
		return `${datePart(value)}T${time}`;
	}

	function setDate(value: DateValue | undefined): void {
		if (value) {
			onDateTimeChange(replaceDatePart(dateTime, value.toString()));
			return;
		}
		if (pickerMode === 'date') {
			onDateTimeChange('');
		}
	}

	function setTime(value: string): void {
		onDateTimeChange(replaceTimePart(dateTime, value));
	}
</script>

<div class:single-column={!showTimeZonePicker} class="date-time-grid">
	{#if pickerMode === 'time'}
		<div class="date-time-picker shiori-form-label">
			<span>
				{label}
				{#if formatCalendarDate(datePart(dateTime))}
					<span class="field-hint">Date fixed as {formatCalendarDate(datePart(dateTime))}</span>
				{/if}
			</span>
			<TimePicker {id} {label} onChange={setTime} value={timePart(dateTime)} />
		</div>
	{:else}
		<DatePicker.Root
			calendarLabel={label}
			closeOnDateSelect={true}
			fixedWeeks={true}
			initialFocus={true}
			{locale}
			minValue={minimumDateValue}
			numberOfMonths={1}
			onValueChange={setDate}
			pagedNavigation={true}
			placeholder={calendarPlaceholder}
			value={dateValue}
			weekdayFormat="short"
		>
			<div class="date-time-picker shiori-form-label">
				<DatePicker.Label class="picker-label">{label}</DatePicker.Label>
				<DatePicker.Input class="date-field shiori-form-control" {id}>
					{#snippet children({ segments })}
						{#each segments as { part, value: segmentValue }, index (`${part}-${index}`)}
							<DatePicker.Segment class={`date-segment${part === 'literal' ? ' literal' : ''}`} {part}>
								{segmentValue}
							</DatePicker.Segment>
						{/each}
						<DatePicker.Trigger aria-label={`Open calendar for ${label}`} class="calendar-trigger">
							<Icon name="disclosure" />
						</DatePicker.Trigger>
					{/snippet}
				</DatePicker.Input>
			</div>
			<DatePicker.Portal disabled={portalTarget === undefined} to={portalTarget}>
				<DatePicker.Content
					align="start"
					class={calendarContentClass}
					collisionPadding={16}
					preventScroll={pickerPresentation === 'dialog'}
					sideOffset={6}
					strategy="fixed"
					trapFocus={pickerPresentation === 'dialog'}
				>
					<DatePicker.Calendar class="calendar-panel">
						{#snippet children({ months, weekdays })}
							<DatePicker.Header class="calendar-header">
								<DatePicker.PrevButton aria-label="Previous month" class="calendar-navigation">
									<Icon name="previous" />
								</DatePicker.PrevButton>
								<div class="calendar-selects">
									<DatePicker.MonthSelect class="calendar-select" monthFormat="long" />
									<DatePicker.YearSelect class="calendar-select" />
								</div>
								<DatePicker.NextButton aria-label="Next month" class="calendar-navigation">
									<Icon name="next" />
								</DatePicker.NextButton>
							</DatePicker.Header>
							<div class="calendar-months">
								{#each months as month (month.value.toString())}
									<DatePicker.Grid class="calendar-grid">
										<DatePicker.GridHead>
											<DatePicker.GridRow>
												{#each weekdays as weekday (weekday)}
													<DatePicker.HeadCell class="calendar-weekday">{weekday}</DatePicker.HeadCell>
												{/each}
											</DatePicker.GridRow>
										</DatePicker.GridHead>
										<DatePicker.GridBody>
											{#each month.weeks as weekDates, weekIndex (`${month.value}-${weekIndex}`)}
												<DatePicker.GridRow>
													{#each weekDates as date (date.toString())}
														<DatePicker.Cell class="calendar-cell" {date} month={month.value}>
															<DatePicker.Day class="calendar-day">{date.day}</DatePicker.Day>
														</DatePicker.Cell>
													{/each}
												</DatePicker.GridRow>
											{/each}
										</DatePicker.GridBody>
									</DatePicker.Grid>
								{/each}
							</div>
						{/snippet}
					</DatePicker.Calendar>
				</DatePicker.Content>
			</DatePicker.Portal>
		</DatePicker.Root>
	{/if}
	{#if pickerMode === 'date-time'}
		<div class="date-time-picker shiori-form-label">
			<span>Time <span class="field-hint">24-hour time</span></span>
			<TimePicker id={`${id}-time`} label={`${label} time`} onChange={setTime} value={timePart(dateTime)} />
		</div>
	{/if}
	{#if showTimeZonePicker}
		<div class="shiori-form-label">
			<label for={`${id}-time-zone`}>Time zone <span class="field-hint">{timeZoneHint}</span></label>
			<TimeZonePicker id={`${id}-time-zone`} onSelect={onTimeZoneChange} options={timeZoneOptions} value={timeZone} />
		</div>
	{/if}
</div>

<style>
	.date-time-grid {
		display: grid;
		gap: 0.875rem;
		grid-template-columns: minmax(15rem, 1fr) minmax(13rem, 1.25fr);
	}

	.date-time-grid.single-column {
		grid-template-columns: minmax(0, 1fr);
	}

	.date-time-picker {
		display: grid;
		gap: 0.375rem;
	}

	:global(.calendar-content.calendar-dialog) {
		z-index: 20;
	}

	.field-hint {
		color: var(--color-text-muted);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	@media (max-width: 32rem) {
		.date-time-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
