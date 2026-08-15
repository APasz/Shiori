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
	import Icon from '$lib/visuals/Icon.svelte';

	let {
		placement = 'floating'
	}: {
		placement?: 'floating' | 'inline';
	} = $props();

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
	class:floating={placement === 'floating'}
	class:inline={placement === 'inline'}
	onclick={toggleTheme}
	title={`Switch to ${alternateTheme(theme)} mode`}
	type="button"
>
	<Icon name={theme === 'dark' ? 'darkTheme' : 'lightTheme'} size="1rem" stroke={1.8} />
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
	}

	.floating {
		position: fixed;
		right: 1rem;
		top: 1rem;
		z-index: 10;
	}

	.inline {
		min-height: 2.25rem;
		padding: 0.375rem 0.5rem;
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
		.floating {
			right: 0.5rem;
			top: 0.5rem;
		}
	}

	@media (max-width: 48rem) {
		.inline {
			gap: 0;
			min-width: 2.25rem;
			padding-inline: 0.25rem;
		}

		.inline span {
			display: none;
		}
	}
</style>
