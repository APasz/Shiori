<script lang="ts">
	import { resolve } from '$app/paths';
	import { browserPages, browserTitle } from '$lib/browser-title';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import TripTopbar from '$lib/components/TripTopbar.svelte';
	import { formatCalendarDate, formatCalendarDateTime } from '$lib/itinerary/calendar';
	import { formatTime } from '$lib/format-preferences';
	import { formatTimestampInTimeZone } from '$lib/itinerary/time';
	import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
	import {
		serverMetricsSchema,
		type MemoryUsage,
		type NetworkPeak,
		type NetworkTraffic,
		type ServerMetrics
	} from '$lib/server-metrics';
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';

	const metricsEndpoint = resolve('/api/admin/metrics');
	const metricsRefreshIntervalMilliseconds = 5_000;
	const byteUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let latestMetrics = $state<ServerMetrics | null>(null);
	let metrics = $derived(latestMetrics ?? data.metrics);
	let metricsRefreshFailed = $state(false);
	let metricsRefreshController: AbortController | null = null;

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

	function formatByteCount(bytes: number): string {
		let unitIndex = 0;
		let value = bytes;
		while (value >= 1_024 && unitIndex < byteUnits.length - 1) {
			value /= 1_024;
			unitIndex += 1;
		}
		const maximumFractionDigits = value < 10 && unitIndex > 0 ? 1 : 0;
		return `${new Intl.NumberFormat(viewerContext.locale ?? undefined, { maximumFractionDigits }).format(value)} ${byteUnits[unitIndex]}`;
	}

	function formatPercentage(value: number): string {
		return `${new Intl.NumberFormat(viewerContext.locale ?? undefined, { maximumFractionDigits: 1 }).format(value)}%`;
	}

	function missingMetricLabel(): string {
		return metrics.sampledAt === null ? 'Collecting…' : 'Unavailable';
	}

	function memoryUsageLabel(memory: MemoryUsage | null): string {
		return memory
			? `${formatByteCount(memory.usedBytes)} of ${formatByteCount(memory.totalBytes)} (${formatPercentage((memory.usedBytes / memory.totalBytes) * 100)})`
			: missingMetricLabel();
	}

	function networkTrafficLabel(network: NetworkTraffic): string {
		return `${formatByteCount(network.receivedBytesPerSecond)}/s received · ${formatByteCount(network.sentBytesPerSecond)}/s sent`;
	}

	function networkPeakLabel(peak: NetworkPeak | null): string {
		if (peak) {
			return networkTrafficLabel(peak);
		}
		return metrics.network ? 'Collecting…' : missingMetricLabel();
	}

	function secondsInTimeZone(timestamp: number, timeZone: string): string | null {
		try {
			const date = new Date(timestamp);
			if (Number.isNaN(date.getTime())) {
				return null;
			}
			return (
				new Intl.DateTimeFormat('en-AU', {
					numberingSystem: 'latn',
					second: '2-digit',
					timeZone
				})
					.formatToParts(date)
					.find((part) => part.type === 'second')?.value ?? null
			);
		} catch {
			return null;
		}
	}

	function timeWithSeconds(time: string, seconds: string): string {
		const formattedTime = formatTime(time, viewerContext.formatPreferences.timeFormat);
		const periodStart = formattedTime.lastIndexOf(' ');
		return periodStart > 0
			? `${formattedTime.slice(0, periodStart)}:${seconds}${formattedTime.slice(periodStart)}`
			: `${formattedTime}:${seconds}`;
	}

	function metricsSampledLabel(sampledAt: number): string {
		const timestamp = formatTimestampInTimeZone(sampledAt, viewerContext.timeZone);
		const seconds = secondsInTimeZone(sampledAt, viewerContext.timeZone);
		if (!timestamp) {
			return new Date(sampledAt).toISOString();
		}
		if (!seconds) {
			return formatCalendarDateTime(
				timestamp.date,
				timestamp.time,
				'date',
				viewerContext.locale,
				viewerContext.formatPreferences.dateFormat,
				viewerContext.formatPreferences.timeFormat
			);
		}
		const date = formatCalendarDate(
			timestamp.date,
			'date',
			viewerContext.locale,
			viewerContext.formatPreferences.dateFormat
		);
		return `${date ?? timestamp.date}, ${timeWithSeconds(timestamp.time, seconds)}`;
	}

	async function refreshMetrics(): Promise<void> {
		metricsRefreshController?.abort();
		const controller = new AbortController();
		metricsRefreshController = controller;
		try {
			const response = await fetch(metricsEndpoint, { cache: 'no-store', signal: controller.signal });
			const payload: unknown = await response.json().catch(() => null);
			const parsed = serverMetricsSchema.safeParse(payload);
			if (metricsRefreshController !== controller) {
				return;
			}
			if (response.ok && parsed.success) {
				latestMetrics = parsed.data;
				metricsRefreshFailed = false;
			} else {
				metricsRefreshFailed = true;
			}
		} catch {
			if (metricsRefreshController === controller) {
				metricsRefreshFailed = true;
			}
		} finally {
			if (metricsRefreshController === controller) {
				metricsRefreshController = null;
			}
		}
	}

	onMount(() => {
		void refreshMetrics();
		const metricsRefreshInterval = window.setInterval(() => {
			void refreshMetrics();
		}, metricsRefreshIntervalMilliseconds);
		return () => {
			metricsRefreshController?.abort();
			metricsRefreshController = null;
			window.clearInterval(metricsRefreshInterval);
		};
	});
</script>

<svelte:head>
	<title>{browserTitle(browserPages.admin)}</title>
</svelte:head>

<TripTopbar activePage="admin" canManageAccounts currentUser={data.currentUser} />

<main>
	<header class="page-heading">
		<PageTitle title="Admin" />
	</header>

	<section aria-labelledby="metrics-heading">
		<h2 id="metrics-heading">Server status</h2>
		<dl class="metrics-list">
			<div>
				<dt>CPU usage <span>last second</span></dt>
				<dd>{metrics.cpuUsagePercent === null ? missingMetricLabel() : formatPercentage(metrics.cpuUsagePercent)}</dd>
			</div>
			<div>
				<dt>RAM used</dt>
				<dd>{memoryUsageLabel(metrics.memory)}</dd>
			</div>
			<div>
				<dt>Network rate <span>last second</span></dt>
				<dd>{metrics.network ? networkTrafficLabel(metrics.network) : missingMetricLabel()}</dd>
			</div>
			<div>
				<dt>Network peak <span>last 48 hours</span></dt>
				<dd>{networkPeakLabel(metrics.networkPeak48Hours)}</dd>
			</div>
		</dl>
		<p class="metrics-description">Network figures include all non-loopback traffic on this server.</p>
		{#if metrics.sampledAt !== null}
			<p class="metrics-updated">
				Updated <time datetime={new Date(metrics.sampledAt).toISOString()}
					>{metricsSampledLabel(metrics.sampledAt)}</time
				>
			</p>
		{/if}
		{#if metricsRefreshFailed}
			<p class="metrics-error">Live updates are unavailable. Showing the most recent values.</p>
		{/if}
	</section>

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

	.metrics-list {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0.75rem 0 0;
	}

	.metrics-list div {
		border: 1px solid var(--color-border-default);
		padding: 0.75rem;
	}

	.metrics-list dt {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.metrics-list dt span {
		display: block;
	}

	.metrics-list dd {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.35;
		margin: 0.25rem 0 0;
		overflow-wrap: anywhere;
	}

	.metrics-description,
	.metrics-updated,
	.metrics-error {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		margin-top: 0.75rem;
	}

	.metrics-error {
		color: var(--color-state-error);
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
		.metrics-list {
			grid-template-columns: 1fr;
		}

		.force-close-button {
			min-height: 2.75rem;
		}
	}
</style>
