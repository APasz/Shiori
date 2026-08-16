<script lang="ts">
	import PageTitle from '$lib/components/PageTitle.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let addPersonOpen = $state(false);

	function synchronizeAddPerson(event: Event): void {
		const details = event.currentTarget;
		if (!(details instanceof HTMLDetailsElement)) {
			throw new Error('The add-person panel must be a details element.');
		}
		addPersonOpen = details.open;
	}

	function autoSubmit(event: Event): void {
		const control = event.currentTarget;
		if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
			throw new Error('Access controls must submit from an input or select element.');
		}
		control.form?.requestSubmit();
	}

	function confirmForceClose(event: SubmitEvent): void {
		if (!window.confirm('Force close the active edit session? Unsaved changes will be lost.')) {
			event.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>Access · Shiori</title>
</svelte:head>

<TripTopbar activePage="access" canManageAccounts currentUser={data.currentUser} trip={data.trip} />

<main>
	<header class="page-heading">
		<PageTitle title="Access" />
	</header>

	{#if form?.visibilityUpdated}
		<p class="success page-status" role="status">Schedule visibility updated.</p>
	{:else if form?.userGranted}
		<p class="success page-status" role="status">Person added to this trip.</p>
	{:else if form?.memberRoleUpdated}
		<p class="success page-status" role="status">Access level updated.</p>
	{:else if form?.editSessionReleased}
		<p class="success page-status" role="status">The active edit session was force closed.</p>
	{:else if form?.editSessionReleased === false}
		<p class="error page-status" role="status">No active edit session was found.</p>
	{/if}

	<section aria-labelledby="visibility-heading" class="access-section">
		<h2 id="visibility-heading">Schedule visibility</h2>
		<form class="visibility-form" action={`?trip=${encodeURIComponent(data.trip.slug)}&/visitorAccess`} method="POST">
			<label class="visibility-control">
				<span>
					<strong>Public schedule</strong>
					<small>Anyone with the link can see the schedule.</small>
				</span>
				<span class="visibility-toggle">
					<input
						aria-label="Allow public visitors to see the trip schedule"
						checked={data.trip.isPublic}
						name="isPublic"
						onchange={autoSubmit}
						type="checkbox"
					/>
				</span>
				<span class="visibility-state">{data.trip.isPublic ? 'Public' : 'Private'}</span>
			</label>
			<noscript><button class="shiori-form-button" type="submit">Save visibility</button></noscript>
		</form>
	</section>

	<section aria-labelledby="people-heading" class="access-section people-section">
		<div class="section-heading">
			<h2 id="people-heading">People <span>{data.members.length}</span></h2>
			<div class="people-actions">
				<details
					class="add-person"
					open={Boolean(form?.grantUserError) || addPersonOpen}
					ontoggle={synchronizeAddPerson}
				>
					<summary>+ Add person</summary>
					<div class="add-person-panel">
						<form
							class="shiori-form add-person-form"
							action={`?trip=${encodeURIComponent(data.trip.slug)}&/grantUser`}
							method="POST"
						>
							<h3>Add an account</h3>
							{#if data.availableAccounts.length === 0}
								<p class="empty-accounts">No other accounts are available for this trip.</p>
							{:else}
								<label class="shiori-form-label">
									Account
									<select class="shiori-form-control" name="username" required>
										<option value="">Choose an account</option>
										{#each data.availableAccounts as account (account.id)}
											<option value={account.username}>{account.username}</option>
										{/each}
									</select>
								</label>
								<label class="shiori-form-label">
									Access level
									<select class="shiori-form-control" name="role">
										<option value="user">Standard</option>
										<option value="admin">Admin</option>
									</select>
								</label>
								{#if form?.grantUserError}<p class="error" role="alert">{form.grantUserError}</p>{/if}
								<button class="shiori-form-button" type="submit">Add to trip</button>
							{/if}
						</form>
					</div>
				</details>
			</div>
		</div>

		<ul class="member-list">
			{#each data.members as member (member.id)}
				<li class="member-row">
					<div class="member-identity">
						<strong>{member.username}</strong>
						{#if member.role === 'sudo'}<span>You</span>{/if}
					</div>
					{#if member.role === 'sudo'}
						<span class="role-badge owner-badge">Owner</span>
					{:else}
						<form action={`?trip=${encodeURIComponent(data.trip.slug)}&/setMemberAccess`} method="POST">
							<input name="memberId" type="hidden" value={member.id} />
							<label class="role-control">
								<span class="visually-hidden">Access level for {member.username}</span>
								<select name="role" onchange={autoSubmit} value={member.role}>
									<option value="none">No access</option>
									<option value="user">Standard</option>
									<option value="admin">Admin</option>
									<option class="remove-access-option" value="remove">Remove access</option>
								</select>
							</label>
							<noscript><button class="shiori-form-button" type="submit">Save</button></noscript>
						</form>
					{/if}
				</li>
			{/each}
		</ul>

		{#if form?.memberRoleError}
			<p class="error" role="alert">{form.memberRoleError}</p>
		{/if}

		<details class="role-access">
			<summary>Role access</summary>
			<dl>
				<div>
					<dt>No access</dt>
					<dd>Their signed-in account remains attached but cannot view the trip, including its public schedule</dd>
				</div>
				<div>
					<dt>Standard</dt>
					<dd>Read-only itinerary and notes</dd>
				</div>
				<div>
					<dt>Admin</dt>
					<dd>Read-only plus sensitive itinerary details</dd>
				</div>
				<div>
					<dt>Remove access</dt>
					<dd>Detaches the account from this trip</dd>
				</div>
			</dl>
		</details>
	</section>

	{#if data.hasActiveEditSession}
		<details class="advanced-section">
			<summary>Advanced</summary>
			<div>
				<p class="active-edit-session">An edit session is active.</p>
				<form
					class="shiori-form"
					action={`?trip=${encodeURIComponent(data.trip.slug)}&/forceCloseEditSession`}
					method="POST"
					onsubmit={confirmForceClose}
				>
					<button class="force-close-button" type="submit">Force close edit session</button>
				</form>
			</div>
		</details>
	{/if}
</main>

<style>
	main {
		margin: 0 auto;
		padding: 0 1rem clamp(2rem, 6vw, 5rem);
		width: min(100%, 42rem);
	}

	.page-status {
		margin: 0.75rem 0 0;
	}

	.access-section,
	.advanced-section {
		border-top: 1px solid var(--color-border-default);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
	}

	h2,
	h3 {
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

	h3 {
		font-size: 0.9375rem;
	}

	.visibility-form {
		display: grid;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.visibility-control {
		align-items: center;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr) auto auto;
	}

	.visibility-control strong,
	.visibility-control small {
		display: block;
	}

	.visibility-control small,
	.member-identity span {
		color: var(--color-text-muted);
		margin-top: 0.125rem;
	}

	.visibility-toggle {
		display: inline-flex;
		height: 2.75rem;
		position: relative;
		width: 4.5rem;
	}

	.visibility-toggle input {
		appearance: none;
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border-strong);
		border-radius: 99px;
		cursor: pointer;
		height: 100%;
		margin: 0;
		width: 100%;
	}

	.visibility-toggle input::after {
		background: var(--color-text-muted);
		border-radius: 50%;
		content: '';
		height: 1.75rem;
		left: 0.5rem;
		position: absolute;
		top: 0.5rem;
		transition: transform 120ms ease;
		width: 1.75rem;
	}

	.visibility-toggle input:checked {
		background: color-mix(in srgb, var(--color-state-selection) 23%, var(--color-surface-raised));
		border-color: var(--color-state-selection);
	}

	.visibility-toggle input:checked::after {
		background: var(--color-state-selection);
		transform: translateX(1.75rem);
	}

	.visibility-toggle input:focus-visible {
		outline: 2px solid var(--color-state-focus);
		outline-offset: 2px;
	}

	.visibility-state,
	.role-badge {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.section-heading {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.people-actions {
		align-items: center;
		display: flex;
		gap: 0.75rem;
	}

	.add-person {
		position: relative;
	}

	.add-person summary,
	.role-access summary,
	.advanced-section > summary {
		cursor: pointer;
	}

	.add-person summary {
		align-items: center;
		border: 1px solid var(--color-state-selection);
		display: inline-flex;
		font-size: 0.875rem;
		gap: 0.25rem;
		list-style: none;
		padding: 0.45rem 0.65rem;
	}

	.add-person summary::-webkit-details-marker {
		display: none;
	}

	.add-person-panel {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		display: grid;
		gap: 1rem;
		margin-top: 0.5rem;
		padding: 1rem;
		position: absolute;
		right: 0;
		width: min(35rem, calc(100vw - 2rem));
		z-index: 1;
	}

	.add-person-form {
		border-top: 1px solid var(--color-border-default);
		padding-top: 1rem;
	}

	.member-list {
		border-bottom: 1px solid var(--color-border-default);
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}

	.member-row {
		align-items: center;
		border-top: 1px solid var(--color-border-default);
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr) auto;
		min-height: 3.25rem;
		padding: 0.5rem 0;
	}

	.member-identity {
		min-width: 0;
	}

	.member-identity strong {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-identity span {
		display: block;
		font-size: 0.8125rem;
	}

	.owner-badge {
		color: var(--color-state-selection);
		grid-column: -1;
	}

	.role-control select {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		min-height: 2.25rem;
		padding: 0.35rem 1.75rem 0.35rem 0.55rem;
	}

	.remove-access-option {
		color: var(--color-state-warning);
	}

	@media (max-width: 34rem) {
		.add-person summary,
		.role-control select,
		.force-close-button {
			min-height: 2.75rem;
		}

		.role-control select {
			font-size: 1rem;
		}

		.visibility-control {
			align-items: start;
		}

		.visibility-state {
			align-self: center;
		}
	}

	.force-close-button {
		background: transparent;
		border: 1px solid var(--color-state-error);
		color: var(--color-state-error);
		cursor: pointer;
		font: inherit;
		justify-self: start;
		min-height: 2.5rem;
		padding: 0.5rem 0.75rem;
	}

	.force-close-button:hover {
		background: color-mix(in srgb, var(--color-state-error) 11%, transparent);
	}

	.role-access,
	.advanced-section {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.role-access {
		margin-top: 1rem;
	}

	.role-access dl {
		display: grid;
		gap: 0.5rem;
		margin: 0.75rem 0 0;
	}

	.role-access dl div {
		display: flex;
		gap: 0.5rem;
	}

	.role-access dt {
		color: var(--color-text-primary);
		font-weight: 700;
	}

	.role-access dd {
		margin: 0;
	}

	.advanced-section > div {
		margin-top: 0.75rem;
	}

	.active-edit-session {
		color: var(--color-state-warning);
		font-weight: 700;
		margin: 0;
	}

	.advanced-section .shiori-form {
		margin-top: 0.75rem;
	}

	.error {
		color: var(--color-state-error);
		margin: 0;
	}

	.success {
		color: var(--color-state-success);
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
</style>
