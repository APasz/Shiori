<script lang="ts">
	import DateTimeInput from '$lib/components/DateTimeInput.svelte';
	import TimeZoneField from '$lib/components/TimeZoneField.svelte';
	import type { TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import { timeZoneReferenceTimestamp, type DateTimePickerMode } from './date-time-input';

	let {
		endDateTime,
		endDefaultDate,
		endId,
		endLabel = 'End',
		startDateTime,
		startDefaultDate,
		startId,
		startLabel = 'Start',
		startPickerMode = 'date-time',
		endPickerMode,
		portalTarget,
		showQuickTimes = false,
		timeZone = 'UTC',
		timeZoneOptions = [],
		onEndDateTimeChange,
		onStartDateTimeChange,
		onTimeZoneChange
	}: {
		endDateTime: string;
		endDefaultDate?: string;
		endId: string;
		endLabel?: string;
		endPickerMode?: DateTimePickerMode;
		startDateTime: string;
		startDefaultDate?: string;
		startId: string;
		startLabel?: string;
		startPickerMode?: DateTimePickerMode;
		portalTarget?: HTMLElement;
		showQuickTimes?: boolean;
		timeZone?: string;
		timeZoneOptions?: TimeZoneSearchOption[];
		onEndDateTimeChange: (value: string) => void;
		onStartDateTimeChange: (value: string) => void;
		onTimeZoneChange: (timeZone: string) => void;
	} = $props();

	const timeZoneTimestamp = $derived(
		timeZoneReferenceTimestamp(
			startDateTime,
			timeZone,
			timeZoneReferenceTimestamp(endDateTime, timeZone, viewerContext.currentTimestamp)
		)
	);
	const resolvedEndPickerMode = $derived(endPickerMode ?? startPickerMode);
</script>

<div class="zoned-date-time-range">
	<TimeZoneField
		id={`${startId}-time-zone`}
		pickerLabel={`${startLabel} and ${endLabel} time zone`}
		onSelect={onTimeZoneChange}
		options={timeZoneOptions}
		referenceTimestamp={timeZoneTimestamp}
		value={timeZone}
	/>
	<div class="date-time-range-fields">
		<DateTimeInput
			dateTime={startDateTime}
			defaultDate={startDefaultDate}
			id={startId}
			label={startLabel}
			onDateTimeChange={onStartDateTimeChange}
			pickerMode={startPickerMode}
			{portalTarget}
			{showQuickTimes}
			showTimeZonePicker={false}
			{timeZone}
		/>
		<DateTimeInput
			dateTime={endDateTime}
			defaultDate={endDefaultDate}
			id={endId}
			label={endLabel}
			onDateTimeChange={onEndDateTimeChange}
			pickerMode={resolvedEndPickerMode}
			{portalTarget}
			{showQuickTimes}
			showTimeZonePicker={false}
			{timeZone}
		/>
	</div>
</div>

<style>
	.zoned-date-time-range,
	.date-time-range-fields {
		display: grid;
		gap: 0.875rem;
	}
</style>
