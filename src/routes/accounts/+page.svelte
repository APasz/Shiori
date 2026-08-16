<script lang="ts">
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { minimumPasswordLength } from '$lib/auth/password-policy';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import Icon from '$lib/visuals/Icon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function actionUrl(action: 'deleteAccount' | 'resetPassword' | 'setTripAccess'): string {
		return `?trip=${encodeURIComponent(data.selectedTrip.slug)}&/${action}`;
	}

	function autoSubmit(event: Event): void {
		const control = event.currentTarget;
		if (!(control instanceof HTMLSelectElement)) {
			throw new Error('The access control must be a select element.');
		}
		control.form?.requestSubmit();
	}

	function confirmPasswordReset(event: SubmitEvent, username: string): void {
		if (!window.confirm(`Reset the password for ${username}? They will need the new password to sign in.`)) {
			event.preventDefault();
		}
	}

	function confirmAccountDeletion(event: SubmitEvent, username: string): void {
		if (
			!window.confirm(`Delete the account for ${username}? Their sessions and all shared-trip access will be removed.`)
		) {
			event.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>Accounts · Shiori</title>
</svelte:head>

<TripTopbar activePage="accounts" canManageAccounts currentUser={data.currentUser} />

<main>
	<header class="page-heading">
		<PageTitle title="Accounts" />
	</header>

	{#if form?.accountDeleted}
		<p class="success page-status" role="status">Account deleted.</p>
	{:else if form?.memberAccessUpdated}
		<p class="success page-status" role="status">Trip access updated.</p>
	{:else if form?.passwordReset}
		<p class="success page-status" role="status">Password reset.</p>
	{/if}

	<section aria-labelledby="users-heading">
		<div class="section-heading">
			<div>
				<h2 id="users-heading">Users <span>{data.accounts.length}</span></h2>
				<p>Access levels apply to the selected trip only.</p>
			</div>
			<form class="trip-selector" method="GET">
				<label>
					<span class="visually-hidden">Trip for access management</span>
					<select name="trip" onchange={autoSubmit} value={data.selectedTrip.slug}>
						{#each data.trips as trip (trip.id)}
							<option value={trip.slug}>{trip.title}</option>
						{/each}
					</select>
				</label>
			</form>
		</div>

		<ul class="account-list">
			{#each data.accounts as account (account.id)}
				<li class="account-row">
					<strong>{account.username}</strong>
					<div class="account-controls">
						{#if account.role === 'sudo'}
							<span class="owner-badge">Owner</span>
						{:else}
							<form action={actionUrl('setTripAccess')} method="POST">
								<input name="userId" type="hidden" value={account.id} />
								<label class="role-control">
									<span class="visually-hidden">Access level for {account.username}</span>
									<select name="role" onchange={autoSubmit} value={account.role}>
										<option value="none">No access</option>
										<option value="user">Standard</option>
										<option value="admin">Admin</option>
										<option class="remove-access-option" value="remove">Remove access</option>
									</select>
								</label>
								<noscript><button class="shiori-form-button" type="submit">Save</button></noscript>
							</form>
							<details class="account-actions">
								<summary aria-label={`Actions for ${account.username}`} title={`Actions for ${account.username}`}>
									<Icon name="more" />
								</summary>
								<div class="account-actions-panel">
									<form
										class="shiori-form"
										action={actionUrl('resetPassword')}
										method="POST"
										onsubmit={(event) => confirmPasswordReset(event, account.username)}
									>
										<input name="userId" type="hidden" value={account.id} />
										<label class="shiori-form-label">
											New password
											<input
												class="shiori-form-control"
												autocomplete="new-password"
												minlength={minimumPasswordLength}
												name="password"
												required
												type="password"
											/>
										</label>
										<button class="shiori-form-button" type="submit">Reset password</button>
									</form>
									{#if !account.ownsTrip}
										<form
											action={actionUrl('deleteAccount')}
											method="POST"
											onsubmit={(event) => confirmAccountDeletion(event, account.username)}
										>
											<input name="userId" type="hidden" value={account.id} />
											<button class="delete-account-button" type="submit">Delete user</button>
										</form>
									{/if}
								</div>
							</details>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		{#if form?.memberAccessError}
			<p class="error" role="alert">{form.memberAccessError}</p>
		{:else if form?.passwordResetError}
			<p class="error" role="alert">{form.passwordResetError}</p>
		{:else if form?.accountDeletionError}
			<p class="error" role="alert">{form.accountDeletionError}</p>
		{/if}
	</section>

	<section aria-labelledby="create-account-heading">
		<h2 id="create-account-heading">Create account</h2>
		<form class="shiori-form" method="POST">
			<label class="shiori-form-label">
				Username <input class="shiori-form-control" autocomplete="username" name="username" required />
			</label>
			<label class="shiori-form-label">
				Password
				<input
					class="shiori-form-control"
					autocomplete="new-password"
					minlength={minimumPasswordLength}
					name="password"
					required
					type="password"
				/>
			</label>
			{#if form?.createAccountError}<p class="error" role="alert">{form.createAccountError}</p>{/if}
			{#if form?.createdAccount}<p class="success" role="status">{form.createdAccount} can now sign in.</p>{/if}
			<button class="shiori-form-button" type="submit">Create account</button>
		</form>
		<p class="access-note">New accounts have no private-trip access until you assign it using the list above.</p>
	</section>
</main>

<style>
	main {
		margin: 0 auto;
		padding: 0 1rem clamp(2rem, 6vw, 5rem);
		width: min(100%, 46rem);
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-size: 1.125rem;
	}

	h2 span,
	.section-heading p {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
	}

	section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	.section-heading {
		align-items: start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.section-heading p {
		margin-top: 0.375rem;
	}

	.shiori-form {
		margin-top: 0.75rem;
	}

	.page-status {
		margin: 0.75rem 0 0;
	}

	.access-note {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin: 1rem 0 0;
	}

	.error {
		color: var(--color-state-error);
		margin: 0.75rem 0 0;
	}

	.success {
		color: var(--color-state-success);
		margin: 0;
	}

	.trip-selector select,
	.role-control select {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		color: inherit;
		font: inherit;
		min-height: 2.25rem;
		padding: 0.375rem 1.75rem 0.375rem 0.5rem;
	}

	.remove-access-option {
		color: var(--color-state-warning);
	}

	.trip-selector select {
		max-width: min(18rem, 45vw);
	}

	.account-list {
		border-bottom: 1px solid var(--color-border-default);
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}

	.account-row {
		align-items: center;
		border-top: 1px solid var(--color-border-default);
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
		min-height: 3.25rem;
		padding: 0.5rem 0;
	}

	.account-row > strong {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-controls {
		align-items: center;
		display: flex;
		gap: 0.5rem;
	}

	.owner-badge {
		color: var(--color-state-selection);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.account-actions {
		position: relative;
	}

	.account-actions summary {
		align-items: center;
		border: 1px solid var(--color-border-strong);
		cursor: pointer;
		display: flex;
		height: 2.25rem;
		justify-content: center;
		list-style: none;
		width: 2.25rem;
	}

	.account-actions summary::-webkit-details-marker {
		display: none;
	}

	.account-actions-panel {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		display: grid;
		gap: 0.75rem;
		padding: 0.875rem;
		position: absolute;
		right: 0;
		top: calc(100% + 0.25rem);
		width: min(20rem, calc(100vw - 2rem));
		z-index: 1;
	}

	.account-actions-panel .shiori-form {
		gap: 0.75rem;
		margin: 0;
	}

	.delete-account-button {
		background: transparent;
		border: 1px solid var(--color-state-error);
		color: var(--color-state-error);
		cursor: pointer;
		font: inherit;
		padding: 0.5rem 0.625rem;
	}

	.visually-hidden {
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		height: 1px;
		overflow: hidden;
		position: absolute;
		white-space: nowrap;
		width: 1px;
	}

	@media (max-width: 34rem) {
		.section-heading {
			align-items: stretch;
			flex-direction: column;
		}

		.trip-selector select {
			max-width: 100%;
			width: 100%;
		}

		.trip-selector select,
		.role-control select,
		.account-actions summary,
		.delete-account-button {
			min-height: 2.75rem;
		}

		.account-actions summary {
			height: 2.75rem;
			width: 2.75rem;
		}

		.account-row {
			align-items: stretch;
			flex-direction: column;
		}

		.account-controls {
			justify-content: space-between;
		}
	}
</style>
