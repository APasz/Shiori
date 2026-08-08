<script lang="ts">
	import { onMount } from 'svelte';
	import { searchTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { isValidIanaTimeZone } from '$lib/itinerary/zoned-time';

	let {
		id,
		options,
		value,
		onSelect
	}: {
		id: string;
		options: TimeZoneSearchOption[];
		value: string;
		onSelect: (timeZone: string) => void;
	} = $props();
	let pickerElement: HTMLDivElement;
	let query = $state('');
	let isOpen = $state(false);
	let activeOptionIndex = $state(0);

	const matches = $derived(searchTimeZoneOptions(options, query));

	onMount(() => {
		query = value;
	});

	$effect(() => {
		if (!isOpen) {
			query = value;
		}
	});

	function select(option: TimeZoneSearchOption): void {
		query = option.timeZone;
		isOpen = false;
		onSelect(option.timeZone);
	}

	function closeAfterFocusChange(): void {
		setTimeout(() => {
			if (pickerElement.contains(document.activeElement)) {
				return;
			}
			if (isValidIanaTimeZone(query)) {
				onSelect(query);
			} else {
				query = value;
			}
			isOpen = false;
		}, 0);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			isOpen = true;
			activeOptionIndex = Math.min(activeOptionIndex + 1, Math.max(matches.length - 1, 0));
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			isOpen = true;
			activeOptionIndex = Math.max(activeOptionIndex - 1, 0);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			query = value;
			isOpen = false;
			return;
		}
		if (event.key === 'Enter') {
			const selected = matches[activeOptionIndex] ?? matches[0];
			if (selected) {
				event.preventDefault();
				select(selected);
			}
		}
	}
</script>

<div bind:this={pickerElement} class="time-zone-picker">
	<input
		aria-autocomplete="list"
		aria-controls={`${id}-options`}
		aria-expanded={isOpen}
		aria-label="Time zone search"
		class="shiori-form-control"
		{id}
		placeholder="Search AEST, JST, CST, or a place"
		role="combobox"
		value={query}
		onblur={closeAfterFocusChange}
		onfocus={() => {
			isOpen = true;
			activeOptionIndex = 0;
		}}
		oninput={(event) => {
			query = event.currentTarget.value;
			isOpen = true;
			activeOptionIndex = 0;
		}}
		onkeydown={handleKeydown}
	/>
	{#if isOpen}
		<ul id={`${id}-options`} role="listbox">
			{#if matches.length === 0}
				<li class="empty">No matching time zone.</li>
			{:else}
				{#each matches as option, index (option.timeZone)}
					<li aria-selected={index === activeOptionIndex} role="option">
						<button onclick={() => select(option)} onmousedown={(event) => event.preventDefault()} type="button">
							<span class="time-zone">{option.timeZone}</span>
							<span>{option.places.join(' · ')}</span>
							{#if option.aliases.length > 0}
								<span class="aliases">{option.aliases.join(' · ')}</span>
							{/if}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.time-zone-picker {
		position: relative;
	}

	ul {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-default);
		box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--color-overlay-backdrop) 40%, transparent);
		left: 0;
		list-style: none;
		margin: 0.25rem 0 0;
		max-height: 16rem;
		overflow-y: auto;
		padding: 0;
		position: absolute;
		right: 0;
		z-index: 2;
	}

	button,
	.empty {
		background: transparent;
		border: 0;
		color: inherit;
		display: grid;
		font: inherit;
		gap: 0.125rem;
		padding: 0.625rem 0.75rem;
		text-align: left;
		width: 100%;
	}

	button {
		cursor: pointer;
	}

	li[aria-selected='true'] button,
	button:hover {
		background: var(--color-surface-subtle);
	}

	.time-zone {
		font-weight: 700;
	}

	.aliases,
	.empty {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
</style>
