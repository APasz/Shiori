<script lang="ts">
	import { minimumPasswordLength } from '$lib/auth/password-policy';
	import Icon from '$lib/visuals/Icon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function confirmPasswordReset(event: SubmitEvent, username: string): void {
		if (!window.confirm(`Reset the password for ${username}? They will need the new password to sign in.`)) {
			event.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>Accounts · Shiori</title>
</svelte:head>

<main>
	<h1>Accounts</h1>
	{#if form?.passwordReset}<p class="success page-status" role="status">Password reset.</p>{/if}

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
		<p class="access-note">New accounts cannot view a private trip until someone adds them to it.</p>
	</section>

	<section aria-labelledby="users-heading">
		<h2 id="users-heading">Users <span>{data.accounts.length}</span></h2>
		<ul class="account-list">
			{#each data.accounts as account (account.id)}
				<li class="account-row">
					<strong>{account.username}</strong>
					{#if account.id === data.currentUserId}
						<span class="current-account">You</span>
					{:else}
						<details class="account-actions">
							<summary aria-label={`Actions for ${account.username}`} title={`Actions for ${account.username}`}>
								<Icon name="more" />
							</summary>
							<div class="account-actions-panel">
								<form
									class="shiori-form"
									action="?/resetPassword"
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
							</div>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
		{#if form?.passwordResetError}<p class="error" role="alert">{form.passwordResetError}</p>{/if}
	</section>
</main>

<style>
	main {
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 5rem) 1rem;
		width: min(100%, 34rem);
	}

	h1,
	h2 {
		margin: 0;
	}

	h2 {
		font-size: 1.125rem;
	}

	h2 span {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
	}

	section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
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
		margin: 0;
	}

	.success {
		color: var(--color-state-success);
		margin: 0;
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

	.current-account {
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
</style>
