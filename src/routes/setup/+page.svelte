<script lang="ts">
	import { minimumPasswordLength } from '$lib/auth/password-policy';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Set up Shiori</title>
</svelte:head>

<main>
	<header>
		<p class="eyebrow">First run</p>
		<h1>Set up Shiori</h1>
	</header>

	<form class="shiori-form" method="POST">
		<label class="shiori-form-label">
			<span>Username</span>
			<input class="shiori-form-control" autocomplete="username" name="username" required />
			<small>3–32 characters: letters, numbers, hyphens, or underscores.</small>
		</label>

		<label class="shiori-form-label">
			<span>Password</span>
			<input
				class="shiori-form-control"
				autocomplete="new-password"
				minlength={minimumPasswordLength}
				name="password"
				required
				type="password"
			/>
			<small>Use at least {minimumPasswordLength} character{minimumPasswordLength === 1 ? '' : 's'}.</small>
		</label>

		<label class="shiori-form-label">
			<span>Confirm password</span>
			<input
				class="shiori-form-control"
				autocomplete="new-password"
				minlength={minimumPasswordLength}
				name="passwordConfirmation"
				required
				type="password"
			/>
		</label>

		{#if data.setupTokenRequired}
			<label class="shiori-form-label">
				<span>Setup token</span>
				<input class="shiori-form-control" autocomplete="off" name="setupToken" required type="password" />
				<small>Set through <code>SHIORI_SETUP_TOKEN</code> before starting Shiori.</small>
			</label>
		{/if}

		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		{#if data.setupTokenConfigurationError}
			<p class="error" role="alert">{data.setupTokenConfigurationError}</p>
		{/if}

		<button class="shiori-form-button" disabled={data.setupTokenConfigurationError !== null} type="submit">
			Create sudo account
		</button>
	</form>
</main>

<style>
	main {
		margin: 0 auto;
		padding: clamp(2.5rem, 9vw, 7rem) 1rem;
		width: min(100%, 34rem);
	}

	header {
		border-left: 2px solid var(--color-state-selection);
		margin-bottom: 2.5rem;
		padding-left: 1rem;
	}

	h1,
	p {
		margin: 0;
	}

	h1 {
		font-size: clamp(2rem, 6vw, 3rem);
		letter-spacing: -0.045em;
		line-height: 1;
	}

	.eyebrow {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin-bottom: 0.625rem;
		text-transform: uppercase;
	}

	.shiori-form {
		gap: 1.5rem;
	}

	.shiori-form-label {
		gap: 0.55rem;
	}

	.shiori-form-label > span {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	small {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		line-height: 1.45;
	}

	code {
		color: var(--color-text-secondary);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.95em;
	}

	.error {
		background: color-mix(in srgb, var(--color-state-error) 11%, transparent);
		border-left: 2px solid var(--color-state-error);
		color: var(--color-state-error);
		padding: 0.75rem;
	}
</style>
