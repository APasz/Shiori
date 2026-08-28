<script lang="ts">
	import { resolve } from '$app/paths';
	import { minimumPasswordLength } from '$lib/auth/password-policy';
	import { browserPages, browserTitle } from '$lib/browser-title';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showPasswords = $state(false);
</script>

<svelte:head>
	<title>{browserTitle(browserPages.account)}</title>
</svelte:head>

<TripTopbar activePage="account" canManageAccounts={data.canManageAccounts} currentUser={data.currentUser} />

<main>
	<header class="page-heading">
		<PageTitle title="Account" />
	</header>

	<section aria-labelledby="username-heading">
		<h2 id="username-heading">Username</h2>
		<p>Use this name to sign in and identify your account.</p>
		<form action="?/changeUsername" class="shiori-form" method="POST">
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

	<section aria-labelledby="password-heading">
		<h2 id="password-heading">Password</h2>
		<p>Changing your password signs out your other active sessions.</p>
		<form action="?/changePassword" class="shiori-form" method="POST">
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

	{#if data.canManageAccounts}
		<section aria-labelledby="administration-heading">
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
	p {
		margin: 0;
	}

	h2 {
		font-size: 1.125rem;
	}

	section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	section > p {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin-top: 0.375rem;
	}

	.shiori-form {
		margin-top: 0.75rem;
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
</style>
