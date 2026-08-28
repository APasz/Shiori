<script lang="ts">
	import { resolve } from '$app/paths';
	import { availableAccountTabs, type AccountTab } from '$lib/account/tabs';
	import { minimumPasswordLength } from '$lib/auth/password-policy';
	import { browserPages, browserTitle } from '$lib/browser-title';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import ThemeModePicker from '$lib/components/ThemeModePicker.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { colourwayLabels, type Colourway } from '$lib/theme/colourway';
	import { colourwayOptions } from '$lib/theme/palette';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showPasswords = $state(false);
	let selectedColourway = $state<Colourway | null>(null);
	let previousSavedColourway = $state<Colourway | undefined>(undefined);
	const previewColourway = $derived(selectedColourway ?? data.currentUser.colourway);
	const visibleTabs = $derived(availableAccountTabs(data.canManageAccounts));

	const accountActionTabs = {
		changeColourway: 'appearance',
		changePassword: 'account',
		changeUsername: 'account'
	} as const satisfies Record<string, AccountTab>;
	type AccountAction = keyof typeof accountActionTabs;

	function actionUrl(action: AccountAction): string {
		return `?tab=${accountActionTabs[action]}&/${action}`;
	}

	$effect(() => {
		const savedColourway = data.currentUser.colourway;
		if (savedColourway !== previousSavedColourway) {
			selectedColourway = null;
			previousSavedColourway = savedColourway;
		}
	});
</script>

<svelte:head>
	<title>{browserTitle(browserPages.account)}</title>
</svelte:head>

<TripTopbar activePage="account" canManageAccounts={data.canManageAccounts} currentUser={data.currentUser} />

<main>
	<header class="page-heading">
		<PageTitle title="Account" />
	</header>

	<nav aria-label="Account settings" class="account-tabs">
		{#each visibleTabs as tab (tab.id)}
			<a aria-current={data.selectedTab === tab.id ? 'page' : undefined} href={resolve(`/account?tab=${tab.id}`)}
				>{tab.label}</a
			>
		{/each}
	</nav>

	{#if data.selectedTab === 'appearance'}
		<section aria-labelledby="appearance-heading" class="account-panel">
			<h2 id="appearance-heading">Appearance</h2>
			<div class="appearance-theme">
				<h3>Theme</h3>
				<ThemeModePicker />
			</div>

			<form action={actionUrl('changeColourway')} class="shiori-form appearance-form" method="POST">
				<fieldset>
					<legend>Colour</legend>
					<div class="colourway-options">
						{#each colourwayOptions as colourway (colourway.name)}
							<label class:colourway-selected={previewColourway === colourway.name}>
								<input
									checked={previewColourway === colourway.name}
									class="colourway-input"
									name="colourway"
									onchange={() => (selectedColourway = colourway.name)}
									type="radio"
									value={colourway.name}
								/>
								<span class="colourway-option">
									<span aria-hidden="true" class="colourway-swatch" style:background-color={colourway.swatch}></span>
									<span>{colourway.label}</span>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<div
					aria-labelledby="colourway-preview-heading"
					class="appearance-preview"
					data-colourway={previewColourway}
					role="group"
				>
					<div class="preview-heading">
						<h3 id="colourway-preview-heading">Preview</h3>
						<span>{colourwayLabels[previewColourway]}</span>
					</div>
					<div class="preview-card">
						<div class="preview-item">
							<span class="preview-time">09:30</span>
							<div>
								<strong>Train to Kyoto</strong>
								<span>Reserved itinerary item</span>
							</div>
						</div>
						<div class="preview-actions">
							<button class="preview-primary" type="button">Save itinerary</button>
							<button class="preview-secondary" type="button">Focus example</button>
						</div>
						<div aria-label="Itinerary item colours" class="preview-item-types" role="group">
							<span class="transport">Transport</span>
							<span class="accommodation">Stay</span>
							<span class="activity">Activity</span>
						</div>
						<div aria-label="Status colours" class="preview-statuses" role="group">
							<span class="success">Confirmed</span>
							<span class="warning">Pending</span>
							<span class="error">Cancelled</span>
						</div>
					</div>
				</div>

				{#if form?.colourwayError}<p class="error" role="alert">{form.colourwayError}</p>{/if}
				{#if form?.colourwayUpdated}<p class="success" role="status">Colour updated.</p>{/if}
				<button class="shiori-form-button" type="submit">Save colour</button>
			</form>
		</section>
	{:else if data.selectedTab === 'account'}
		<div class="account-panel">
			<section aria-labelledby="username-heading" class="account-section">
				<h2 id="username-heading">Username</h2>
				<p>Use this name to sign in and identify your account.</p>
				<form action={actionUrl('changeUsername')} class="shiori-form" method="POST">
					<label class="shiori-form-label">
						Username
						<input
							class="shiori-form-control"
							autocomplete="username"
							name="username"
							required
							value={data.currentUser.username}
						/>
					</label>
					{#if form?.usernameError}<p class="error" role="alert">{form.usernameError}</p>{/if}
					{#if form?.usernameUpdated}<p class="success" role="status">Username updated.</p>{/if}
					<button class="shiori-form-button" type="submit">Save username</button>
				</form>
			</section>

			<section aria-labelledby="password-heading" class="account-section">
				<h2 id="password-heading">Password</h2>
				<p>Changing your password signs out your other active sessions.</p>
				<form action={actionUrl('changePassword')} class="shiori-form" method="POST">
					<label class="shiori-form-label">
						Current password
						<input
							class="shiori-form-control"
							autocomplete="current-password"
							name="currentPassword"
							required
							type={showPasswords ? 'text' : 'password'}
						/>
					</label>
					<label class="shiori-form-label">
						New password
						<input
							class="shiori-form-control"
							autocomplete="new-password"
							minlength={minimumPasswordLength}
							name="newPassword"
							required
							type={showPasswords ? 'text' : 'password'}
						/>
					</label>
					<label class="shiori-form-label">
						Confirm new password
						<input
							class="shiori-form-control"
							autocomplete="new-password"
							minlength={minimumPasswordLength}
							name="newPasswordConfirmation"
							required
							type={showPasswords ? 'text' : 'password'}
						/>
					</label>
					<label class="password-visibility">
						<input bind:checked={showPasswords} type="checkbox" />
						Show passwords
					</label>
					{#if form?.passwordError}<p class="error" role="alert">{form.passwordError}</p>{/if}
					{#if form?.passwordChanged}<p class="success" role="status">Password updated.</p>{/if}
					<button class="shiori-form-button" type="submit">Change password</button>
				</form>
			</section>
		</div>
	{:else if data.canManageAccounts}
		<section aria-labelledby="administration-heading" class="account-panel">
			<h2 id="administration-heading">Administration</h2>
			<p>Manage global accounts and their access to your trips.</p>
			<a class="accounts-link" href={resolve('/accounts')}>Accounts</a>
		</section>
	{/if}
</main>

<style>
	main {
		margin: 0 auto;
		padding: 0 1rem clamp(2rem, 6vw, 5rem);
		width: min(100%, 42rem);
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		font-size: 1.125rem;
	}

	h3 {
		font-size: 0.9375rem;
	}

	.account-tabs {
		border-bottom: 1px solid var(--color-border-default);
		display: flex;
		gap: 0.125rem;
		margin-top: 1.5rem;
		overflow-x: auto;
	}

	.account-tabs a {
		align-items: center;
		border: 1px solid transparent;
		border-bottom: 0;
		color: var(--color-text-secondary);
		display: inline-flex;
		font-size: 0.875rem;
		font-weight: 700;
		min-height: 2.75rem;
		padding: 0.5rem 0.75rem;
		text-decoration: none;
		white-space: nowrap;
	}

	.account-tabs a:hover {
		background: var(--color-surface-subtle);
		color: var(--color-text-primary);
	}

	.account-tabs a[aria-current='page'] {
		background: var(--color-surface-page);
		border-color: var(--color-border-default);
		box-shadow: inset 0 -2px 0 var(--color-state-selection);
		color: var(--color-text-primary);
	}

	.account-tabs a:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: -3px;
	}

	.account-panel {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	.account-section + .account-section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	.account-panel > p,
	.account-section > p {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin-top: 0.375rem;
	}

	.shiori-form {
		margin-top: 0.75rem;
	}

	.appearance-theme,
	.appearance-form {
		border-top: 1px solid var(--color-border-subtle);
		margin-top: 1rem;
		padding-top: 1rem;
	}

	.appearance-theme :global(.theme-mode-picker) {
		margin-top: 0.75rem;
	}

	fieldset {
		border: 0;
		margin: 0;
		min-width: 0;
		padding: 0;
	}

	legend {
		font-size: 0.9375rem;
		font-weight: 700;
		padding: 0;
	}

	.colourway-options {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-top: 0.75rem;
	}

	.colourway-options label {
		cursor: pointer;
		position: relative;
	}

	.colourway-input {
		height: 1px;
		margin: -1px;
		opacity: 0;
		position: absolute;
		width: 1px;
	}

	.colourway-option {
		align-items: center;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-default);
		display: flex;
		font-size: 0.875rem;
		font-weight: 700;
		gap: 0.5rem;
		min-height: 2.875rem;
		padding: 0.5rem 0.625rem;
	}

	.colourway-options label:hover .colourway-option {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.colourway-selected .colourway-option {
		border-color: var(--color-state-selection);
		box-shadow: inset 0 0 0 1px var(--color-state-selection);
	}

	.colourway-input:focus-visible + .colourway-option {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.colourway-swatch {
		border-radius: 50%;
		height: 1rem;
		width: 1rem;
	}

	.appearance-preview {
		border: 1px solid var(--color-border-default);
		margin-top: 0.25rem;
		padding: 1rem;
	}

	.preview-heading {
		align-items: baseline;
		display: flex;
		justify-content: space-between;
	}

	.preview-heading span {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.preview-card {
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.875rem;
		margin-top: 0.75rem;
		padding: 0.875rem;
	}

	.preview-item {
		align-items: start;
		border-left: 3px solid var(--color-item-type-transport);
		display: flex;
		gap: 0.75rem;
		padding-left: 0.625rem;
	}

	.preview-time {
		color: var(--color-item-type-transport);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.preview-item div {
		display: grid;
		gap: 0.125rem;
	}

	.preview-item div span {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
	}

	.preview-actions,
	.preview-item-types,
	.preview-statuses {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.preview-primary,
	.preview-secondary {
		appearance: none;
		border: 1px solid var(--color-border-strong);
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		min-height: 2.25rem;
		padding: 0.375rem 0.625rem;
	}

	.preview-primary {
		background: var(--color-state-selection);
		border-color: var(--color-state-selection);
		color: var(--color-text-on-accent);
	}

	.preview-secondary {
		background: var(--color-surface-raised);
		color: inherit;
	}

	.preview-primary:focus-visible,
	.preview-secondary:focus-visible {
		outline: 3px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.preview-item-types span,
	.preview-statuses span {
		border: 1px solid currentColor;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.25rem 0.375rem;
	}

	.transport {
		color: var(--color-item-type-transport);
	}

	.accommodation {
		color: var(--color-item-type-accommodation);
	}

	.activity {
		color: var(--color-item-type-activity);
	}

	.preview-statuses .success {
		color: var(--color-state-success);
	}

	.preview-statuses .warning {
		color: var(--color-state-warning);
	}

	.preview-statuses .error {
		color: var(--color-state-error);
	}

	.password-visibility {
		align-items: center;
		display: flex;
		gap: 0.5rem;
		width: fit-content;
	}

	.error {
		color: var(--color-state-error);
	}

	.success {
		color: var(--color-state-success);
	}

	.accounts-link {
		border: 1px solid var(--color-state-selection);
		color: inherit;
		display: inline-block;
		margin-top: 0.75rem;
		padding: 0.625rem 1rem;
		text-decoration: none;
	}

	.accounts-link:hover {
		background: var(--color-surface-subtle);
	}

	.accounts-link:focus-visible {
		border-color: var(--color-state-focus);
		outline: 2px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	@media (max-width: 30rem) {
		.colourway-options {
			grid-template-columns: 1fr;
		}
	}
</style>
