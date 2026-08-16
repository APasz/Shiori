<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { clearOfflineTripPages } from '$lib/offline';
	import type { AuthenticatedUser } from '$lib/server/store/model';
	import type { TripView } from '$lib/server/store/views';
	import Icon from '$lib/visuals/Icon.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	type TopbarPage = 'access' | 'accounts' | 'costs' | 'itinerary' | 'notes' | 'trips';
	type TopbarTrip = Pick<TripView, 'access' | 'itinerary' | 'slug'>;
	type TopbarUser = Pick<AuthenticatedUser, 'username'>;

	let {
		activePage,
		canManageAccounts = false,
		canModifyItinerary = false,
		currentUser,
		isOffline = false,
		onEditTrip,
		onExport,
		trip = undefined
	}: {
		activePage: TopbarPage;
		canManageAccounts?: boolean;
		canModifyItinerary?: boolean;
		currentUser: TopbarUser | null;
		isOffline?: boolean;
		onEditTrip?: () => void;
		onExport?: () => void;
		trip?: TopbarTrip;
	} = $props();

	let tripMenuOpen = $state(false);
	let accountMenuOpen = $state(false);
	let tripMenuElement = $state<HTMLDetailsElement | null>(null);
	let accountMenuElement = $state<HTMLDetailsElement | null>(null);
	const homeHref = $derived(resolve('/'));
	const itineraryHref = $derived(trip ? resolve('/trips/[slug]', { slug: trip.slug }) : null);
	const notesHref = $derived(trip ? resolve('/trips/[slug]/notes', { slug: trip.slug }) : null);
	const costsHref = $derived(trip ? resolve('/trips/[slug]/costs', { slug: trip.slug }) : null);
	const accessHref = $derived(trip ? resolve(`/settings/access?trip=${encodeURIComponent(trip.slug)}`) : null);
	const canViewCosts = $derived(trip?.access === 'admin' || trip?.access === 'sudo');
	const canViewNotes = $derived(trip !== undefined && trip.access !== 'visitor');

	function runTripAction(action: (() => void) | undefined): void {
		tripMenuOpen = false;
		action?.();
	}

	function synchronizeTripMenu(event: Event): void {
		if (!(event.currentTarget instanceof HTMLDetailsElement)) {
			throw new Error('The trip menu toggle event did not originate from its details element.');
		}

		tripMenuOpen = event.currentTarget.open;
		if (tripMenuOpen) {
			accountMenuOpen = false;
		}
	}

	function synchronizeAccountMenu(event: Event): void {
		if (!(event.currentTarget instanceof HTMLDetailsElement)) {
			throw new Error('The account menu toggle event did not originate from its details element.');
		}

		accountMenuOpen = event.currentTarget.open;
		if (accountMenuOpen) {
			tripMenuOpen = false;
		}
	}

	function closeMenusOnOutsidePointerDown(event: PointerEvent): void {
		if (!(event.target instanceof Node)) {
			return;
		}

		if (!tripMenuElement?.contains(event.target)) {
			tripMenuOpen = false;
		}
		if (!accountMenuElement?.contains(event.target)) {
			accountMenuOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('pointerdown', closeMenusOnOutsidePointerDown);
		return () => document.removeEventListener('pointerdown', closeMenusOnOutsidePointerDown);
	});
</script>

<header class="trip-topbar">
	<div class="topbar-content">
		<a aria-current={activePage === 'trips' ? 'page' : undefined} class="trip-identity" href={homeHref}>
			<span class="product-name">Shiori</span>
		</a>

		<nav aria-label="Primary navigation" class="section-nav">
			{#if trip && itineraryHref}
				<a aria-current={activePage === 'itinerary' ? 'page' : undefined} href={itineraryHref}>
					<span>Itinerary</span>
					<span aria-hidden="true" class="label-width">Itinerary</span>
				</a>
			{/if}
			{#if trip && canViewNotes && notesHref}
				<a aria-current={activePage === 'notes' ? 'page' : undefined} href={notesHref}>
					<span>Notes</span>
					<span aria-hidden="true" class="label-width">Notes</span>
				</a>
			{/if}
			{#if trip && canViewCosts && costsHref}
				<a aria-current={activePage === 'costs' ? 'page' : undefined} href={costsHref}>
					<span>Costs</span>
					<span aria-hidden="true" class="label-width">Costs</span>
				</a>
			{/if}
			{#if trip?.access === 'sudo' && accessHref}
				<a aria-current={activePage === 'access' ? 'page' : undefined} href={accessHref}>
					<span>Access</span>
					<span aria-hidden="true" class="label-width">Access</span>
				</a>
			{/if}
			{#if canManageAccounts}
				<a aria-current={activePage === 'accounts' ? 'page' : undefined} href={resolve('/accounts')}>
					<span>Accounts</span>
					<span aria-hidden="true" class="label-width">Accounts</span>
				</a>
			{/if}
		</nav>

		<div class="topbar-actions">
			{#if isOffline}
				<span class="connection-status" role="status">Offline</span>
			{/if}
			{#if onExport}
				<button class="export-button" onclick={onExport} type="button">Export</button>
			{/if}
			{#if trip && canModifyItinerary && onEditTrip}
				<details bind:this={tripMenuElement} bind:open={tripMenuOpen} class="trip-menu" ontoggle={synchronizeTripMenu}>
					<summary aria-label="Trip options" title="Trip options"><Icon name="more" /></summary>
					<div class="topbar-menu">
						<button onclick={() => runTripAction(onEditTrip)} type="button">Edit trip</button>
					</div>
				</details>
			{/if}
			{#if currentUser}
				<details
					bind:this={accountMenuElement}
					bind:open={accountMenuOpen}
					class="account-menu"
					ontoggle={synchronizeAccountMenu}
				>
					<summary aria-label={`Account options for ${currentUser.username}`} title="Account options">
						<span aria-hidden="true" class="account-mark">{currentUser.username.slice(0, 1).toUpperCase()}</span>
						<span class="account-name">{currentUser.username}</span>
						<Icon name="disclosure" size="0.875rem" />
					</summary>
					<div class="topbar-menu">
						<form action="/logout" method="POST" onsubmit={clearOfflineTripPages}>
							<button type="submit">Sign out</button>
						</form>
					</div>
				</details>
			{:else}
				<a class="sign-in-link" href={resolve('/login')}>Sign in</a>
			{/if}
			<ThemeToggle placement="inline" />
		</div>
	</div>
</header>

<style>
	.trip-topbar {
		background: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border-default);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.topbar-content {
		align-items: center;
		display: flex;
		gap: 1rem;
		margin: 0 auto;
		min-height: 3.5rem;
		padding: 0.5rem 1rem;
		width: min(100%, 90rem);
	}

	.trip-identity {
		align-items: baseline;
		color: inherit;
		display: flex;
		flex: 0 1 auto;
		font-size: 0.875rem;
		gap: 0.375rem;
		min-width: 0;
		text-decoration: none;
	}

	.product-name {
		font-weight: 750;
		letter-spacing: -0.02em;
	}

	.section-nav {
		align-items: center;
		display: flex;
		gap: 0.125rem;
	}

	.section-nav a,
	.export-button,
	.sign-in-link,
	.trip-menu summary,
	.account-menu summary {
		align-items: center;
		background: transparent;
		border: 1px solid transparent;
		color: inherit;
		display: inline-flex;
		font: inherit;
		font-size: 0.8125rem;
		min-height: 2.25rem;
		padding: 0.375rem 0.5rem;
		text-decoration: none;
	}

	.section-nav a {
		border-radius: 0.25rem;
		color: var(--color-text-secondary);
		display: grid;
	}

	.section-nav a > span {
		grid-area: 1 / 1;
	}

	.label-width {
		font-weight: 700;
		visibility: hidden;
	}

	.section-nav a[aria-current='page'] {
		background: var(--color-surface-subtle);
		color: var(--color-text-primary);
		font-weight: 700;
	}

	.topbar-actions {
		align-items: center;
		display: flex;
		gap: 0.125rem;
		margin-left: auto;
	}

	.connection-status {
		align-items: center;
		color: var(--color-state-warning);
		display: inline-flex;
		font-size: 0.75rem;
		font-weight: 700;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
	}

	.connection-status::before {
		background: currentColor;
		border-radius: 50%;
		content: '';
		height: 0.5rem;
		width: 0.5rem;
	}

	.export-button,
	.sign-in-link,
	.trip-menu summary,
	.account-menu summary {
		border-color: var(--color-border-default);
		border-radius: 0.25rem;
		cursor: pointer;
	}

	.export-button {
		font-weight: 700;
	}

	.trip-menu,
	.account-menu {
		position: relative;
	}

	.trip-menu summary,
	.account-menu summary {
		cursor: pointer;
		list-style: none;
	}

	.trip-menu summary::-webkit-details-marker,
	.account-menu summary::-webkit-details-marker {
		display: none;
	}

	.account-menu summary {
		gap: 0.375rem;
		padding-left: 0.375rem;
	}

	.account-mark {
		align-items: center;
		background: var(--color-surface-subtle);
		border-radius: 50%;
		display: inline-flex;
		font-size: 0.6875rem;
		font-weight: 750;
		height: 1.25rem;
		justify-content: center;
		width: 1.25rem;
	}

	.account-name {
		max-width: 10rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.topbar-menu {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		display: grid;
		gap: 0.125rem;
		padding: 0.25rem;
		position: absolute;
		right: 0;
		top: calc(100% + 0.375rem);
		width: max-content;
		z-index: 1;
	}

	.topbar-menu button {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.5rem 0.625rem;
		text-align: left;
		text-decoration: none;
	}

	.topbar-menu button:hover,
	.section-nav a:hover,
	.export-button:hover,
	.sign-in-link:hover,
	.trip-menu summary:hover,
	.account-menu summary:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.section-nav a:focus-visible,
	.export-button:focus-visible,
	.sign-in-link:focus-visible,
	.trip-menu summary:focus-visible,
	.account-menu summary:focus-visible,
	.topbar-menu button:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	@media (max-width: 48rem) {
		.topbar-content {
			column-gap: 0.5rem;
			flex-wrap: wrap;
			padding: 0.375rem 0.5rem 0;
		}

		.trip-identity {
			font-size: 0.8125rem;
			max-width: calc(100vw - 15rem);
		}

		.section-nav {
			border-top: 1px solid var(--color-border-subtle);
			flex: 1 0 100%;
			order: 3;
			overflow-x: auto;
			padding: 0.25rem 0;
		}

		.topbar-actions {
			gap: 0;
		}

		.account-name,
		.connection-status {
			display: none;
		}

		.account-menu summary {
			padding-inline: 0.5rem;
		}
	}

	@media (max-width: 28rem) {
		.export-button {
			font-size: 0;
			min-width: 2.25rem;
			padding-inline: 0.25rem;
		}

		.export-button::after {
			content: '⇩';
			font-size: 1rem;
		}
	}
</style>
