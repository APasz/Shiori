<script lang="ts">
	import { browserPages, browserTitle } from '$lib/browser-title';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { formatCalendarDateTime } from '$lib/itinerary/calendar';
	import { formatTimestampInTimeZone } from '$lib/itinerary/time';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function confirmForceClose(event: SubmitEvent): void {
		if (!window.confirm('Close all active edit sessions? Unsaved changes will be lost.')) {
			event.preventDefault();
		}
	}

	function confirmForceLogout(event: SubmitEvent): void {
		if (!window.confirm('Force logout all users? You will also be logged out.')) {
			event.preventDefault();
		}
	}

	function sessionRenewedLabel(sessionRenewedAt: number): string {
		const timestamp = formatTimestampInTimeZone(sessionRenewedAt, viewerContext.timeZone);
		return timestamp
			? formatCalendarDateTime(
					timestamp.date,
					timestamp.time,
					'date',
					viewerContext.locale,
					viewerContext.formatPreferences.dateFormat,
					viewerContext.formatPreferences.timeFormat
				)
			: new Date(sessionRenewedAt).toISOString();
	}
</script>

<svelte:head>
	<title>{browserTitle(browserPages.admin)}</title>
</svelte:head>

<TripTopbar activePage="admin" canManageAccounts currentUser={data.currentUser} />

<main>
	<header class="page-heading">
		<PageTitle title="Admin" />
	</header>

	<section aria-labelledby="sessions-heading">
		<h2 id="sessions-heading">Sessions</h2>
		<form action="?/forceCloseEditSessions" method="POST" onsubmit={confirmForceClose}>
			<button class="force-close-button" disabled={!data.hasActiveEdits} type="submit">Force close edits</button>
		</form>
		{#if form?.released !== undefined}
			<p class="success" role="status">Closed {form.released} session{form.released === 1 ? '' : 's'}.</p>
		{:else if form?.forceCloseError}
			<p class="error" role="alert">{form.forceCloseError}</p>
		{/if}
		<form action="?/forceLogoutUsers" method="POST" onsubmit={confirmForceLogout}>
			<button class="force-close-button" type="submit">Force logout users</button>
		</form>
		{#if form?.forceLogoutError}
			<p class="error" role="alert">{form.forceLogoutError}</p>
		{/if}
	</section>

	<section aria-labelledby="users-heading">
		<h2 id="users-heading">Signed in <span>{data.users.length}</span></h2>
		{#if data.users.length > 0}
			<ul class="user-list">
				{#each data.users as user (user.id)}
					{@const sessionRenewed = sessionRenewedLabel(user.lastSeenAt)}
					<li>
						<strong>{user.username}</strong>
						<time aria-label={`Session renewed ${sessionRenewed}`} datetime={new Date(user.lastSeenAt).toISOString()}
							>{sessionRenewed}</time
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	main {
		margin: 0 auto;
		padding: 0 1rem clamp(2rem, 6vw, 5rem);
		width: min(100%, 42rem);
	}

	section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-size: 1.125rem;
	}

	h2 span,
	time {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
	}

	form,
	.success,
	.error {
		margin-top: 0.75rem;
	}

	.force-close-button {
		background: transparent;
		border: 1px solid var(--color-state-error);
		color: var(--color-state-error);
		cursor: pointer;
		font: inherit;
		padding: 0.5rem 0.625rem;
	}

	.force-close-button:disabled {
		border-color: var(--color-border-default);
		color: var(--color-text-muted);
		cursor: not-allowed;
	}

	.success {
		color: var(--color-state-success);
	}

	.error {
		color: var(--color-state-error);
	}

	.user-list {
		border-bottom: 1px solid var(--color-border-default);
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}

	.user-list li {
		align-items: center;
		border-top: 1px solid var(--color-border-default);
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
		min-height: 3.25rem;
	}

	@media (max-width: 34rem) {
		.force-close-button {
			min-height: 2.75rem;
		}
	}
</style>
