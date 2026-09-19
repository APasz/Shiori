<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import { today, type DateValue } from '@internationalized/date';
	import './date-picker.css';
	import {
		adjustCalendarDate,
		minimumCalendarDateValue,
		parseCalendarDate,
		type DayAdjustment
	} from '$lib/components/date-picker';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import TimeZoneField from '$lib/components/TimeZoneField.svelte';
	import { datePickerDateSeparator, datePickerLocale, formatCalendarDate } from '$lib/itinerary/calendar';
	import type { TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { clampLocalDateTimeToUnixEpoch } from '$lib/itinerary/zoned-time';
	import Icon from '$lib/visuals/Icon.svelte';
	import { defaultDateForTimeOnlyValue, timeZoneReferenceTimestamp, type DateTimePickerMode } from './date-time-input';

	type PickerPresentation = 'popover' | 'dialog';
	type DialogPlacement = 'center' | 'above-development-controls';
	let {
		id,
		dateTime,
		defaultDate,
		label,
		minimumDate,
		pickerMode = 'date-time',
		dialogPlacement: _dialogPlacement = 'center',
		pickerPresentation = 'popover',
		portalTarget,
		showQuickTimes = false,
		showTimeZonePicker = true,
		timeZone = 'UTC',
		timeZoneOptions = [],
		onDateTimeChange,
		onTimeZoneChange = () => undefined
	}: {
		id: string;
		dateTime: string;
		defaultDate?: string;
		label: string;
		minimumDate?: string;
		pickerMode?: DateTimePickerMode;
		dialogPlacement?: DialogPlacement;
		pickerPresentation?: PickerPresentation;
		portalTarget?: HTMLElement;
		showQuickTimes?: boolean;
		showTimeZonePicker?: boolean;
		timeZone?: string;
		timeZoneOptions?: TimeZoneSearchOption[];
		onDateTimeChange: (value: string) => void;
		onTimeZoneChange?: (timeZone: string) => void;
	} = $props();
	const locale = $derived(datePickerLocale(viewerContext.locale, viewerContext.formatPreferences.dateFormat));
	const dateSeparator = $derived(
		datePickerDateSeparator(viewerContext.locale, viewerContext.formatPreferences.dateFormat)
	);
	const fixedDateLabel = $derived(
		formatCalendarDate(datePart(dateTime), 'date', viewerContext.locale, viewerContext.formatPreferences.dateFormat)
	);

	const dateValue = $derived(parseCalendarDate(datePart(dateTime)));
	const configuredMinimumDateValue = $derived(parseCalendarDate(minimumDate ?? ''));
	const minimumDateValue = $derived(
		configuredMinimumDateValue && configuredMinimumDateValue.compare(minimumCalendarDateValue) > 0
			? configuredMinimumDateValue
			: minimumCalendarDateValue
	);
	const calendarPlaceholder = $derived(dateValue ?? today(timeZone));
	const canDecreaseDate = $derived(
		dateValue !== undefined &&
			adjustCalendarDate(dateValue, -1) !== undefined &&
			dateValue.compare(minimumDateValue) > 0
	);
	const canIncreaseDate = $derived(dateValue !== undefined && adjustCalendarDate(dateValue, 1) !== undefined);
	const calendarContentClass = $derived(
		`calendar-content${pickerPresentation === 'dialog' ? ` calendar-dialog ${_dialogPlacement}` : ''}`
	);
	const timeZoneTimestamp = $derived(timeZoneReferenceTimestamp(dateTime, timeZone, viewerContext.currentTimestamp));

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

	function setDateTime(value: string): void {
		onDateTimeChange(clampLocalDateTimeToUnixEpoch(value, timeZone));
	}

	function setDate(value: DateValue | undefined): void {
		if (value) {
			if (value.compare(minimumDateValue) < 0) {
				return;
			}
			setDateTime(replaceDatePart(dateTime, value.toString()));
			return;
		}
		if (pickerMode === 'date') {
			onDateTimeChange('');
		}
	}

	function adjustDate(adjustment: DayAdjustment): void {
		if (!dateValue) {
			return;
		}

		const adjustedDate = adjustCalendarDate(dateValue, adjustment);
		if (!adjustedDate || adjustedDate.compare(minimumDateValue) < 0) {
			return;
		}

		setDateTime(replaceDatePart(dateTime, adjustedDate.toString()));
	}

	function setTime(value: string): void {
		setDateTime(defaultDateForTimeOnlyValue(replaceTimePart(dateTime, value), defaultDate));
	}
</script>

<div class="date-time-input">
	{#if showTimeZonePicker}
		<TimeZoneField
			id={`${id}-time-zone`}
			pickerLabel={`${label} time zone`}
			onSelect={onTimeZoneChange}
			options={timeZoneOptions}
			referenceTimestamp={timeZoneTimestamp}
			value={timeZone}
		/>
	{/if}
	{#if pickerMode === 'time'}
		<div class="date-time-fields">
			<div class="date-time-picker shiori-form-label">
				<span>
					{label}
					{#if fixedDateLabel}
						<span class="field-hint">Date: {fixedDateLabel}</span>
					{/if}
				</span>
				<TimePicker
					{id}
					label={`${label} time`}
					onChange={setTime}
					{showQuickTimes}
					timeFormat={viewerContext.formatPreferences.timeFormat}
					value={timePart(dateTime)}
				/>
			</div>
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
			<div
				aria-labelledby={pickerMode === 'date-time' ? `${id}-heading` : undefined}
				class:has-date-and-time={pickerMode === 'date-time'}
				class="date-time-fields"
				role={pickerMode === 'date-time' ? 'group' : undefined}
			>
				{#if pickerMode === 'date-time'}
					<span class="date-time-heading" id={`${id}-heading`}>{label}</span>
				{/if}
				<div class="date-time-picker shiori-form-label">
					<DatePicker.Label class="picker-label">{pickerMode === 'date-time' ? 'Date' : label}</DatePicker.Label>
					<DatePicker.Input class="date-field date-field-with-controls shiori-form-control" {id}>
						{#snippet children({ segments })}
							{#each segments as { part, value: segmentValue }, index (`${part}-${index}`)}
								<DatePicker.Segment class={`date-segment${part === 'literal' ? ' literal' : ''}`} {part}>
									{part === 'literal' && dateSeparator ? dateSeparator : segmentValue}
								</DatePicker.Segment>
							{/each}
							<div aria-label="Day controls" class="date-controls" role="group">
								<button
									aria-label="Increase day"
									disabled={!canIncreaseDate}
									onclick={() => adjustDate(1)}
									type="button"
								>
									<Icon name="increment" />
								</button>
								<button
									aria-label="Decrease day"
									disabled={!canDecreaseDate}
									onclick={() => adjustDate(-1)}
									type="button"
								>
									<Icon name="decrement" />
								</button>
							</div>
							<DatePicker.Trigger
								aria-label={`Open calendar for ${label}`}
								class="calendar-trigger date-calendar-trigger"
							>
								<Icon name="calendar" />
							</DatePicker.Trigger>
						{/snippet}
					</DatePicker.Input>
				</div>
				{#if pickerMode === 'date-time'}
					<div class="date-time-picker shiori-form-label">
						<span>
							Time
							<span class="field-hint"
								>{viewerContext.formatPreferences.timeFormat === 'twelve-hour' ? '12-hour' : '24-hour'}</span
							>
						</span>
						<TimePicker
							id={`${id}-time`}
							label={`${label} time`}
							onChange={setTime}
							{showQuickTimes}
							timeFormat={viewerContext.formatPreferences.timeFormat}
							value={timePart(dateTime)}
						/>
					</div>
				{/if}
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
</div>

<style>
	.date-time-input {
		display: grid;
		gap: 0.875rem;
	}

	.date-time-fields {
		display: grid;
		gap: 0.875rem;
		grid-template-columns: minmax(0, 1fr);
	}

	.date-time-fields.has-date-and-time {
		column-gap: 0.875rem;
		row-gap: 0.375rem;
		grid-template-columns: minmax(12rem, 1fr) minmax(10rem, 0.8fr);
	}

	.date-time-heading {
		font-weight: 700;
		grid-column: 1 / -1;
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
		.date-time-fields.has-date-and-time {
			grid-template-columns: 1fr;
		}
	}
</style>
