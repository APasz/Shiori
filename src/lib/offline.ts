import { base } from '$app/paths';

const tripPathPrefix = `${base}/trips/`;
const cacheTripPageMessageType = 'cache-trip-page';
const clearOfflineTripPagesMessageType = 'clear-offline-trip-pages';

type CacheTripPageMessage = {
	readonly type: typeof cacheTripPageMessageType;
	readonly url: string;
};

type ClearOfflineTripPagesMessage = {
	readonly type: typeof clearOfflineTripPagesMessageType;
};

function isTripPagePath(pathname: string): boolean {
	return pathname.startsWith(tripPathPrefix) && pathname.length > tripPathPrefix.length;
}

function cacheTripPage(worker: ServiceWorker | null): void {
	if (!worker || !isTripPagePath(window.location.pathname)) {
		return;
	}

	const message: CacheTripPageMessage = {
		type: cacheTripPageMessageType,
		url: window.location.href
	};
	worker.postMessage(message);
}

function cacheCurrentTripPage(): void {
	const worker = navigator.serviceWorker.controller;
	if (worker) {
		cacheTripPage(worker);
		return;
	}

	void navigator.serviceWorker.ready.then((registration) => cacheTripPage(registration.active));
}

/** Registers the offline worker and saves the currently displayed trip for offline viewing. */
export function registerOfflineSupport(): void {
	if (!('serviceWorker' in navigator)) {
		return;
	}

	void navigator.serviceWorker
		.register(`${base}/service-worker.js`)
		.then(() => navigator.serviceWorker.ready)
		.then((registration) => cacheTripPage(registration.active))
		.catch(() => {
			// Offline support is optional when the browser cannot register a service worker.
		});
}

/** Refreshes the offline copy after an itinerary mutation has completed. */
export function refreshOfflineTripPage(): void {
	if (!('serviceWorker' in navigator)) {
		return;
	}

	cacheCurrentTripPage();
}

/** Removes locally cached itineraries before ending the browser session. */
export function clearOfflineTripPages(): void {
	if (!('serviceWorker' in navigator)) {
		return;
	}

	const message: ClearOfflineTripPagesMessage = { type: clearOfflineTripPagesMessageType };
	const worker = navigator.serviceWorker.controller;
	if (worker) {
		worker.postMessage(message);
		return;
	}

	void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(message));
}
