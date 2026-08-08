<script lang="ts">
	import { onMount } from 'svelte';
	import {
		alternateTheme,
		defaultTheme,
		setDocumentTheme,
		themeFromStorageValue,
		themeStorageKey,
		type ThemeName
	} from '$lib/theme/theme';

	let theme = $state<ThemeName>(defaultTheme);

	function applyTheme(nextTheme: ThemeName, persist: boolean): void {
		theme = nextTheme;
		setDocumentTheme(nextTheme);
		if (!persist) {
			return;
		}

		try {
			localStorage.setItem(themeStorageKey, nextTheme);
		} catch {
			// The selected theme remains active when browser storage is unavailable.
		}
	}

	function toggleTheme(): void {
		applyTheme(alternateTheme(theme), true);
	}

	onMount(() => {
		applyTheme(themeFromStorageValue(document.documentElement.dataset.theme), false);
	});
</script>

<button
	aria-label={`Switch to ${alternateTheme(theme)} mode`}
	aria-pressed={theme === 'dark'}
	class="theme-toggle"
	onclick={toggleTheme}
	title={`Switch to ${alternateTheme(theme)} mode`}
	type="button"
>
	<span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
	<span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
</button>

<style>
	.theme-toggle {
		align-items: center;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-default);
		color: var(--color-text-primary);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		gap: 0.375rem;
		letter-spacing: 0.04em;
		padding: 0.25rem 0.5rem;
		position: fixed;
		right: 1rem;
		top: 1rem;
		z-index: 1;
	}

	.theme-toggle:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.theme-toggle:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	@media (max-width: 36rem) {
		.theme-toggle {
			right: 0.5rem;
			top: 0.5rem;
		}
	}
</style>
