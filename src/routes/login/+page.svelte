<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in · Shiori</title>
</svelte:head>

<main>
	<h1>Sign in</h1>
	{#if data.setupRequired}
		<p>No sudo account exists yet. <a href={resolve('/setup')}>Set up Shiori first.</a></p>
	{:else}
		<form class="shiori-form" method="POST">
			<label class="shiori-form-label">
				Username
				<input class="shiori-form-control" autocomplete="username" name="username" required />
			</label>
			<label class="shiori-form-label">
				Password
				<input
					class="shiori-form-control"
					autocomplete="current-password"
					name="password"
					required
					type="password"
				/>
			</label>
			{#if form?.invalidCredentials}
				<p class="error" role="alert">The username or password is incorrect.</p>
			{/if}
			{#if form?.retryAfterSeconds}
				<p class="error" role="alert">
					Too many sign-in attempts. Try again in {form.retryAfterSeconds} seconds.
				</p>
			{/if}
			<button class="shiori-form-button" type="submit">Sign in</button>
		</form>
	{/if}
</main>

<style>
	main {
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 5rem) 1rem;
		width: min(100%, 28rem);
	}

	.error {
		color: var(--color-state-error);
		margin: 0;
	}

	a {
		color: inherit;
		text-underline-offset: 0.15em;
	}
</style>
