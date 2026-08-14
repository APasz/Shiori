<script lang="ts">
	import { onMount } from 'svelte';
	import { DateRangePicker, Portal } from 'bits-ui';
	import { parseDate, today, type CalendarDate, type DateValue } from '@internationalized/date';
	import './date-picker.css';

	type DateRangeChange = Readonly<{
		checkInDate: string;
		checkOutDate: string;
	}>;
	type DateRangeValue = Readonly<{
		start: DateValue | undefined;
		end: DateValue | undefined;
	}>;

	const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;

	let {
		id,
		checkInDate,
		checkOutDate,
		label = 'Stay dates',
		onDateRangeChange,
		portalTarget
	}: {
		id: string;
		checkInDate: string;
		checkOutDate: string;
		label?: string;
		onDateRangeChange: (range: DateRangeChange) => void;
		portalTarget?: HTMLElement;
	} = $props();
	let locale = $state('en-AU');
	let numberOfMonths = $state(1);

	const startValue = $derived(calendarDate(checkInDate));
	const endValue = $derived(calendarDate(checkOutDate));
	const dateRange = $derived<DateRangeValue>({ start: startValue, end: endValue });
	const calendarPlaceholder = $derived(startValue ?? endValue ?? today('UTC'));

	onMount(() => {
		locale = navigator.language || locale;
		const desktopQuery = window.matchMedia('(min-width: 46rem)');
		const updateNumberOfMonths = (): void => {
			numberOfMonths = desktopQuery.matches ? 2 : 1;
		};

		updateNumberOfMonths();
		desktopQuery.addEventListener('change', updateNumberOfMonths);
		return () => desktopQuery.removeEventListener('change', updateNumberOfMonths);
	});

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

	function setDateRange(value: DateRangeValue): void {
		onDateRangeChange({
			checkInDate: value.start?.toString() ?? '',
			checkOutDate: value.end?.toString() ?? ''
		});
	}
</script>

<DateRangePicker.Root
	calendarLabel={label}
	closeOnRangeSelect={true}
	fixedWeeks={true}
	{locale}
	minDays={2}
	{numberOfMonths}
	onValueChange={setDateRange}
	pagedNavigation={true}
	placeholder={calendarPlaceholder}
	value={dateRange}
	weekdayFormat="short"
>
	<div class="stay-date-range shiori-form-label">
		<DateRangePicker.Label class="picker-label">{label}</DateRangePicker.Label>
		<div class="stay-date-inputs">
			<DateRangePicker.Input aria-label="Check-in date" class="date-field shiori-form-control" {id} type="start">
				{#snippet children({ segments })}
					{#each segments as { part, value }, index (`start-${part}-${index}`)}
						<DateRangePicker.Segment class={`date-segment${part === 'literal' ? ' literal' : ''}`} {part}>
							{value}
						</DateRangePicker.Segment>
					{/each}
				{/snippet}
			</DateRangePicker.Input>
			<span aria-hidden="true" class="stay-date-separator">→</span>
			<DateRangePicker.Input
				aria-label="Check-out date"
				class="date-field shiori-form-control"
				id={`${id}-end`}
				type="end"
			>
				{#snippet children({ segments })}
					{#each segments as { part, value }, index (`end-${part}-${index}`)}
						<DateRangePicker.Segment class={`date-segment${part === 'literal' ? ' literal' : ''}`} {part}>
							{value}
						</DateRangePicker.Segment>
					{/each}
				{/snippet}
			</DateRangePicker.Input>
			<DateRangePicker.Trigger aria-label={`Choose ${label.toLowerCase()}`} class="calendar-trigger"
				>⌄</DateRangePicker.Trigger
			>
		</div>
	</div>
	<Portal disabled={portalTarget === undefined} to={portalTarget}>
		<DateRangePicker.Content
			align="start"
			class="calendar-content"
			collisionPadding={16}
			sideOffset={6}
			strategy="fixed"
		>
			<DateRangePicker.Calendar
				class={`calendar-panel stay-calendar-panel${numberOfMonths === 1 ? ' single-month' : ''}`}
			>
				{#snippet children({ months, weekdays })}
					<DateRangePicker.Header class="calendar-header">
						<DateRangePicker.PrevButton aria-label="Previous months" class="calendar-navigation"
							>‹</DateRangePicker.PrevButton
						>
						<div class="calendar-selects">
							<DateRangePicker.MonthSelect class="calendar-select" monthFormat="long" />
							<DateRangePicker.YearSelect class="calendar-select" />
						</div>
						<DateRangePicker.NextButton aria-label="Next months" class="calendar-navigation"
							>›</DateRangePicker.NextButton
						>
					</DateRangePicker.Header>
					<div class="calendar-months">
						{#each months as month (month.value.toString())}
							<DateRangePicker.Grid class="calendar-grid">
								<DateRangePicker.GridHead>
									<DateRangePicker.GridRow>
										{#each weekdays as weekday (weekday)}
											<DateRangePicker.HeadCell class="calendar-weekday">{weekday}</DateRangePicker.HeadCell>
										{/each}
									</DateRangePicker.GridRow>
								</DateRangePicker.GridHead>
								<DateRangePicker.GridBody>
									{#each month.weeks as weekDates, weekIndex (`${month.value}-${weekIndex}`)}
										<DateRangePicker.GridRow>
											{#each weekDates as date (date.toString())}
												<DateRangePicker.Cell class="calendar-cell" {date} month={month.value}>
													<DateRangePicker.Day class="calendar-day stay-calendar-day">{date.day}</DateRangePicker.Day>
												</DateRangePicker.Cell>
											{/each}
										</DateRangePicker.GridRow>
									{/each}
								</DateRangePicker.GridBody>
							</DateRangePicker.Grid>
						{/each}
					</div>
				{/snippet}
			</DateRangePicker.Calendar>
		</DateRangePicker.Content>
	</Portal>
</DateRangePicker.Root>

<style>
	.stay-date-range {
		display: grid;
		gap: 0.375rem;
	}

	.stay-date-inputs {
		align-items: center;
		display: grid;
		gap: 0.375rem;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
	}

	.stay-date-separator {
		color: var(--color-text-muted);
	}

	:global(.stay-calendar-panel) {
		width: min(44rem, calc(100vw - 2rem));
	}

	:global(.stay-calendar-panel .calendar-months) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	:global(.stay-calendar-panel.single-month .calendar-months) {
		grid-template-columns: minmax(0, 1fr);
	}

	:global(.stay-calendar-day[data-range-middle]),
	:global(.stay-calendar-day[data-highlighted]) {
		background: color-mix(in srgb, var(--color-state-selection) 20%, transparent);
		border-color: transparent;
		color: var(--color-text-primary);
	}

	:global(.stay-calendar-day[data-range-start]),
	:global(.stay-calendar-day[data-range-end]) {
		background: var(--color-state-selection);
		border-color: var(--color-state-selection);
		color: var(--color-text-on-accent);
	}

	@media (max-width: 45.999rem) {
		.stay-date-inputs {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.stay-date-separator {
			display: none;
		}

		:global(.stay-calendar-panel) {
			width: min(22rem, calc(100vw - 2rem));
		}
	}
</style>
