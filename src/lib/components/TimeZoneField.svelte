<script lang="ts">
	import TimeZonePicker from '$lib/components/TimeZonePicker.svelte';
	import type { TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';

	let {
		id,
		label = 'Time zone',
		pickerLabel,
		options,
		referenceTimestamp,
		value,
		onSelect
	}: {
		id: string;
		label?: string;
		pickerLabel?: string;
		options: TimeZoneSearchOption[];
		referenceTimestamp?: number;
		value: string;
		onSelect: (timeZone: string) => void;
	} = $props();

	const resolvedPickerLabel = $derived(pickerLabel ?? label);
</script>

<div class="time-zone-field shiori-form-label">
	<label for={id}>{label}</label>
	<TimeZonePicker {id} label={resolvedPickerLabel} {onSelect} {options} {referenceTimestamp} {value} />
</div>

<style>
	.time-zone-field {
		max-width: 24rem;
	}
</style>
