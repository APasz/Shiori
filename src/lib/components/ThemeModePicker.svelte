<script lang="ts">
	import { onMount } from 'svelte';
	import { defaultThemeMode, setDocumentThemeMode, subscribeToThemeMode, type ThemeMode } from '$lib/theme/theme';
	import { themeModeOptions } from '$lib/theme/theme-mode-options';
	import Icon from '$lib/visuals/Icon.svelte';

	let themeMode = $state<ThemeMode>(defaultThemeMode);

	function selectThemeMode(mode: ThemeMode): void {
		setDocumentThemeMode(mode);
	}

	onMount(() => {
		return subscribeToThemeMode((mode) => (themeMode = mode));
	});
</script>

<div aria-label="Theme for this device" class="theme-mode-picker" role="group">
	{#each themeModeOptions as option (option.value)}
		<button
			aria-pressed={themeMode === option.value}
			class:active={themeMode === option.value}
			onclick={() => selectThemeMode(option.value)}
			type="button"
		>
			<Icon name={option.icon} size="1rem" stroke={1.8} />
			<span>{option.label}</span>
		</button>
	{/each}
</div>

<style>
	.theme-mode-picker {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		max-width: 25rem;
		overflow: hidden;
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
	}

	button {
		align-items: center;
		appearance: none;
		background: var(--color-surface-raised);
		border: 0;
		border-right: 1px solid var(--color-border-default);
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 700;
		gap: 0.375rem;
		justify-content: center;
		min-height: 2.5rem;
		padding: 0.5rem 0.75rem;
	}

	button:last-child {
		border-right: 0;
	}

	button:hover {
		background: var(--color-surface-subtle);
	}

	button.active {
		background: var(--color-state-selection);
		color: var(--color-text-on-accent);
	}

	button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: -3px;
		position: relative;
		z-index: 1;
	}

	@media (max-width: 30rem) {
		button {
			font-size: 0.75rem;
			gap: 0.2rem;
			padding-inline: 0.25rem;
		}
	}
</style>
