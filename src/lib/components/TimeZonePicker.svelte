<script lang="ts">
	import { searchTimeZoneOptions, type TimeZoneSearchOption } from '$lib/itinerary/time-zone-search';
	import { isValidIanaTimeZone } from '$lib/itinerary/zoned-time';

	let {
		clearQueryOnFocus = false,
		commitOnBlur = true,
		disabled = false,
		id,
		label = 'Time zone',
		options,
		value,
		onSelect
	}: {
		clearQueryOnFocus?: boolean;
		commitOnBlur?: boolean;
		disabled?: boolean;
		id: string;
		label?: string;
		options: TimeZoneSearchOption[];
		value: string;
		onSelect: (timeZone: string) => void;
	} = $props();
	let pickerElement = $state<HTMLDivElement | null>(null);
	let inputElement = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let isOpen = $state(false);
	let opensAbove = $state(false);
	let listMaxHeight = $state<string | undefined>(undefined);
	let activeOptionIndex = $state(0);

	const inputValue = $derived(isOpen ? query : value);
	const matches = $derived(searchTimeZoneOptions(options, query));

	$effect(() => {
		if (disabled) {
			isOpen = false;
		}
	});

	$effect(() => {
		if (!isOpen) {
			return;
		}

		window.addEventListener('resize', updateListPlacement);
		document.addEventListener('scroll', updateListPlacement, true);
		return () => {
			window.removeEventListener('resize', updateListPlacement);
			document.removeEventListener('scroll', updateListPlacement, true);
		};
	});

	function select(option: TimeZoneSearchOption): void {
		if (disabled) {
			return;
		}
		query = option.timeZone;
		isOpen = false;
		onSelect(option.timeZone);
	}

	function updateListPlacement(): void {
		if (!isOpen || !inputElement) {
			return;
		}

		const dialogScrollArea = pickerElement?.closest<HTMLElement>('[data-dialog-scroll-area]');
		const boundary = dialogScrollArea?.getBoundingClientRect();
		const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
		const inset = rootFontSize;
		const gap = 0.25 * rootFontSize;
		const minimumTop = boundary ? boundary.top + gap : inset;
		const maximumBottom = boundary ? boundary.bottom - gap : window.innerHeight - inset;
		const inputBounds = inputElement.getBoundingClientRect();
		const spaceAbove = Math.max(0, inputBounds.top - minimumTop - gap);
		const spaceBelow = Math.max(0, maximumBottom - inputBounds.bottom - gap);
		const maximumListHeight = 16 * rootFontSize;

		opensAbove = spaceAbove > spaceBelow;
		listMaxHeight = `${Math.min(maximumListHeight, Math.max(spaceAbove, spaceBelow))}px`;
	}

	function openList(): void {
		isOpen = true;
		updateListPlacement();
	}

	function closeAfterFocusChange(): void {
		const currentPickerElement = pickerElement;
		setTimeout(() => {
			if (currentPickerElement === null || pickerElement !== currentPickerElement) {
				return;
			}
			if (disabled) {
				isOpen = false;
				return;
			}
			if (currentPickerElement.contains(document.activeElement)) {
				return;
			}
			if (commitOnBlur && isValidIanaTimeZone(query)) {
				onSelect(query);
			} else {
				query = value;
			}
			isOpen = false;
		}, 0);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (disabled) {
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			openList();
			activeOptionIndex = Math.min(activeOptionIndex + 1, Math.max(matches.length - 1, 0));
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			openList();
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
		bind:this={inputElement}
		aria-autocomplete="list"
		aria-controls={`${id}-options`}
		aria-expanded={isOpen}
		aria-label={label}
		class="shiori-form-control"
		{disabled}
		{id}
		placeholder="Search AEST, JST, CST, or a place"
		role="combobox"
		value={inputValue}
		onblur={closeAfterFocusChange}
		onfocus={() => {
			query = clearQueryOnFocus ? '' : value;
			activeOptionIndex = 0;
			openList();
		}}
		oninput={(event) => {
			query = event.currentTarget.value;
			activeOptionIndex = 0;
			openList();
		}}
		onkeydown={handleKeydown}
	/>
	{#if isOpen}
		<ul
			class:opens-above={opensAbove}
			id={`${id}-options`}
			role="listbox"
			style:--time-zone-picker-list-max-height={listMaxHeight}
		>
			{#if matches.length === 0}
				<li class="empty">No matching time zone</li>
			{:else}
				{#each matches as option, index (option.timeZone)}
					<li aria-selected={index === activeOptionIndex} role="option">
						<button
							{disabled}
							onclick={() => select(option)}
							onmousedown={(event) => event.preventDefault()}
							type="button"
						>
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
		max-height: var(--time-zone-picker-list-max-height, 16rem);
		overflow-y: auto;
		padding: 0;
		position: absolute;
		right: 0;
		z-index: 2;
	}

	ul.opens-above {
		bottom: calc(100% + 0.25rem);
		margin: 0;
		top: auto;
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

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
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
