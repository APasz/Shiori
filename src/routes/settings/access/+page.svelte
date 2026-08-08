<script lang="ts">
	import { resolve } from '$app/paths';
	import { minimumPasswordLength } from '$lib/auth/password-policy';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function confirmForceClose(event: SubmitEvent): void {
		if (!window.confirm('Force close the active edit session? Unsaved changes will be lost.')) {
			event.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>Access · Shiori</title>
</svelte:head>

<main>
	<p>
		{#if data.trip.slug === 'example'}
			<a href={resolve('/')}>← {data.trip.itinerary.title}</a>
		{:else}
			<a href={resolve('/trips/[slug]', { slug: data.trip.slug })}>← {data.trip.itinerary.title}</a>
		{/if}
	</p>
	<h1>Access</h1>
	<p>Only the sudo owner can manage access. User and admin roles are always read-only.</p>

	<section>
		<h2>Visitor access</h2>
		<form class="shiori-form" action={`?trip=${encodeURIComponent(data.trip.slug)}&/visitorAccess`} method="POST">
			<label class="shiori-form-label">
				<input checked={data.trip.isPublic} name="isPublic" type="checkbox" />
				Allow public visitors to see the trip schedule
			</label>
			<button class="shiori-form-button" type="submit">Save visitor access</button>
		</form>
	</section>

	<section>
		<h2>Edit session</h2>
		<p class:active-edit-session={data.hasActiveEditSession} class="edit-session-status">
			{data.hasActiveEditSession ? 'An edit session is currently active.' : 'No edit session is active.'}
		</p>
		<form
			class="shiori-form"
			action={`?trip=${encodeURIComponent(data.trip.slug)}&/forceCloseEditSession`}
			method="POST"
			onsubmit={confirmForceClose}
		>
			<button
				aria-describedby="force-close-description"
				class="force-close-button shiori-form-button"
				disabled={!data.hasActiveEditSession}
				type="submit"
			>
				Force close active edit session
			</button>
			<p id="force-close-description">This closes any editor immediately. Unsaved changes in that session are lost.</p>
			{#if form?.editSessionReleased}
				<p class="success" role="status">The active edit session was force closed.</p>
			{:else if form?.editSessionReleased === false}
				<p class="error" role="status">No active edit session was found.</p>
			{/if}
		</form>
	</section>

	<section>
		<h2>Shared users</h2>
		<ul>
			{#each data.members as member (member.id)}
				<li><strong>{member.username}</strong><span>{member.role}</span></li>
			{/each}
		</ul>

		<h3>Add a shared user</h3>
		<form class="shiori-form" action={`?trip=${encodeURIComponent(data.trip.slug)}&/createUser`} method="POST">
			<label class="shiori-form-label">
				Username <input class="shiori-form-control" autocomplete="username" name="username" required />
			</label>
			<label class="shiori-form-label">
				Temporary password
				<input
					class="shiori-form-control"
					autocomplete="new-password"
					minlength={minimumPasswordLength}
					name="password"
					required
					type="password"
				/>
			</label>
			<label class="shiori-form-label">
				Access level
				<select class="shiori-form-control" name="role">
					<option value="user">User — standard details</option>
					<option value="admin">Admin — sensitive details</option>
				</select>
			</label>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			{#if form?.created}<p class="success">Shared user created.</p>{/if}
			<button class="shiori-form-button" type="submit">Create user</button>
		</form>
	</section>
</main>

<style>
	main {
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 5rem) 1rem;
		width: min(100%, 42rem);
	}

	section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 2rem;
		padding-top: 1.5rem;
	}

	.shiori-form {
		margin-top: 1rem;
	}

	input[type='checkbox'] {
		accent-color: var(--color-state-selection);
		width: auto;
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	li span {
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	.error {
		color: var(--color-state-error);
	}

	.success {
		color: var(--color-state-success);
	}

	.edit-session-status {
		color: var(--color-text-secondary);
	}

	.active-edit-session {
		color: var(--color-state-warning);
		font-weight: 700;
	}

	.force-close-button {
		border-color: var(--color-state-error);
		color: var(--color-state-error);
	}

	.force-close-button:not(:disabled):hover {
		background: color-mix(in srgb, var(--color-state-error) 11%, transparent);
	}

	a {
		color: inherit;
		text-underline-offset: 0.15em;
	}
</style>
