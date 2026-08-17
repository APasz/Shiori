import { base } from '$app/paths';
import {
	offlineMessageTypes,
	type CacheTripPagesMessage,
	type ClearTripPagesMessage,
	type GetTripCacheStatusMessage,
	type TripCacheStatusResponse
} from '$lib/offline-protocol';

const tripPathPrefix = `${base}/trips/`;
const workerMessageTimeoutMilliseconds = 5_000;

export type OfflineTripCacheStatus =
	| { readonly supported: false }
	| { readonly supported: true; readonly cached: boolean; readonly persistent: boolean | null };

function isTripPagePath(pathname: string): boolean {
	return pathname.startsWith(tripPathPrefix) && pathname.length > tripPathPrefix.length;
}

/** Returns every trip section that is safe to prepare for read-only offline viewing. */
export function tripOfflineUrls(url: URL): readonly string[] {
	if (!isTripPagePath(url.pathname)) {
		return [];
	}

	const relativeTripPath = url.pathname.slice(tripPathPrefix.length);
	const tripSlug = relativeTripPath.split('/', 1)[0];
	if (!tripSlug) {
		return [];
	}

	const tripRootUrl = new URL(`${tripPathPrefix}${tripSlug}`, url.origin);
	return [
		tripRootUrl,
		new URL(`${tripRootUrl.pathname}/notes`, url.origin),
		new URL(`${tripRootUrl.pathname}/costs`, url.origin)
	].map((tripUrl) => tripUrl.href);
}

function browserSupportsOfflineTrips(): boolean {
	return 'serviceWorker' in navigator;
}

async function activeWorker(): Promise<ServiceWorker | null> {
	if (!browserSupportsOfflineTrips()) {
		return null;
	}
	if (navigator.serviceWorker.controller) {
		return navigator.serviceWorker.controller;
	}

	return new Promise((resolve) => {
		const timeoutId = window.setTimeout(() => resolve(null), workerMessageTimeoutMilliseconds);
		void navigator.serviceWorker.ready
			.then((registration) => resolve(registration.active ?? navigator.serviceWorker.controller))
			.catch(() => resolve(null))
			.finally(() => window.clearTimeout(timeoutId));
	});
}

function isTripCacheStatusResponse(value: unknown): value is TripCacheStatusResponse {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const response = value as { readonly type?: unknown; readonly cached?: unknown };
	return response.type === offlineMessageTypes.tripCacheStatus && typeof response.cached === 'boolean';
}

async function requestWorkerStatus(
	worker: ServiceWorker,
	message: CacheTripPagesMessage | GetTripCacheStatusMessage
): Promise<boolean | null> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		const timeoutId = window.setTimeout(() => {
			channel.port1.close();
			resolve(null);
		}, workerMessageTimeoutMilliseconds);
		channel.port1.onmessage = (event: MessageEvent<unknown>) => {
			window.clearTimeout(timeoutId);
			channel.port1.close();
			resolve(isTripCacheStatusResponse(event.data) ? event.data.cached : null);
		};
		worker.postMessage(message, [channel.port2]);
	});
}

async function storagePersistence(): Promise<boolean | null> {
	if (!('storage' in navigator) || typeof navigator.storage.persisted !== 'function') {
		return null;
	}

	try {
		return await navigator.storage.persisted();
	} catch {
		return null;
	}
}

async function requestStoragePersistence(): Promise<boolean | null> {
	if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
		return null;
	}

	try {
		return await navigator.storage.persist();
	} catch {
		return null;
	}
}

function currentTripUrls(): readonly string[] {
	return tripOfflineUrls(new URL(window.location.href));
}

function appHomeUrl(): string {
	return new URL(`${base}/`, window.location.origin).href;
}

function currentTripCacheMessage(): CacheTripPagesMessage | null {
	const urls = currentTripUrls();
	if (urls.length === 0) {
		return null;
	}

	return { type: offlineMessageTypes.cacheTripPages, homeUrl: appHomeUrl(), urls };
}

async function refreshCurrentSavedTrip(): Promise<void> {
	const message = currentTripCacheMessage();
	if (!message) {
		return;
	}

	const worker = await activeWorker();
	if (!worker) {
		return;
	}

	const cached = await requestWorkerStatus(worker, {
		type: offlineMessageTypes.getTripCacheStatus,
		url: message.urls[0]
	});
	if (cached) {
		worker.postMessage(message);
	}
}

/** Registers the offline worker. Trips are saved only after an explicit user request. */
export function registerOfflineSupport(): void {
	if (!browserSupportsOfflineTrips()) {
		return;
	}

	void navigator.serviceWorker.register(`${base}/service-worker.js`).catch(() => {
		// Offline support is optional when the browser cannot register a service worker.
	});
}

/** Returns whether the displayed trip is cached and whether its origin has persistent browser storage. */
export async function currentTripOfflineCacheStatus(): Promise<OfflineTripCacheStatus> {
	const urls = currentTripUrls();
	if (!browserSupportsOfflineTrips() || urls.length === 0) {
		return { supported: false };
	}

	const worker = await activeWorker();
	if (!worker) {
		return { supported: false };
	}

	const [cached, persistent] = await Promise.all([
		requestWorkerStatus(worker, { type: offlineMessageTypes.getTripCacheStatus, url: urls[0] }),
		storagePersistence()
	]);
	return { cached: cached === true, persistent, supported: true };
}

/** Saves the itinerary, notes, and permitted costs page for read-only offline use. */
export async function saveCurrentTripForOffline(): Promise<OfflineTripCacheStatus> {
	if (!browserSupportsOfflineTrips()) {
		return { supported: false };
	}

	const message = currentTripCacheMessage();
	if (!message) {
		return { supported: false };
	}

	const worker = await activeWorker();
	if (!worker) {
		return { supported: false };
	}

	const cached = await requestWorkerStatus(worker, message);
	const persistent = cached === true ? await requestStoragePersistence() : await storagePersistence();
	return { cached: cached === true, persistent, supported: true };
}

/** Refreshes the saved trip sections after a successful itinerary mutation. */
export function refreshOfflineTripPage(): void {
	void refreshCurrentSavedTrip();
}

/** Removes locally cached offline-viewer pages before ending the browser session. */
export function clearOfflineTripPages(): void {
	if (!browserSupportsOfflineTrips()) {
		return;
	}

	const message: ClearTripPagesMessage = { type: offlineMessageTypes.clearTripPages };
	void activeWorker().then((worker) => worker?.postMessage(message));
}
