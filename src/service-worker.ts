import { base, build, files } from '$service-worker';
import { browserPages, browserTitle } from '$lib/browser-title';
import {
	offlineMessageTypes,
	type ClearTripPagesMessage,
	type GetTripCacheStatusMessage,
	type TripCacheStatusResponse
} from '$lib/offline-protocol';

const worker = self as unknown as ServiceWorkerGlobalScope;
// Keep hashed application assets with their saved trip pages so an app update does not break offline hydration.
const applicationCacheName = 'shiori:application';
const offlineViewerCacheName = 'shiori:offline:viewer';
const legacyCacheNamePrefix = 'shiori:offline:';
const applicationAssets = new Set([...build, ...files]);
const immutableAssetPathPrefix = `${base}/_app/immutable/`;
const tripPathPrefix = `${base}/trips/`;
const tripDataPathSuffix = '/__data.json';
const logoutPath = `${base}/logout`;
const tripCacheStatusPathPrefix = `${base}/__offline-trip-cache-status/`;

type LegacyCacheTripPageMessage = {
	readonly type: 'cache-trip-page';
	readonly url: string;
};

type CachedTripPagesRequest = {
	readonly homeUrl: string | null;
	readonly urls: readonly string[];
};

type OfflinePageCacheResult = 'cached' | 'not-authorized' | 'failed';

function isTripPage(url: URL): boolean {
	return url.pathname.startsWith(tripPathPrefix) && url.pathname.length > tripPathPrefix.length;
}

function isHomePage(url: URL): boolean {
	return url.pathname === `${base}/`;
}

function isTripDataRequest(url: URL): boolean {
	if (!url.pathname.endsWith(tripDataPathSuffix)) {
		return false;
	}

	const tripPath = url.pathname.slice(0, -tripDataPathSuffix.length);
	return tripPath.startsWith(tripPathPrefix) && tripPath.length > tripPathPrefix.length;
}

function isHomeDataRequest(url: URL): boolean {
	return url.pathname === `${base}/__data.json`;
}

function isOfflineViewerDataRequest(url: URL): boolean {
	return isHomeDataRequest(url) || isTripDataRequest(url);
}

function isOfflineViewerResource(url: URL): boolean {
	return isHomePage(url) || isTripPage(url) || isOfflineViewerDataRequest(url);
}

function isApplicationAsset(url: URL): boolean {
	return applicationAssets.has(url.pathname) || url.pathname.startsWith(immutableAssetPathPrefix);
}

function tripRootUrl(url: URL): URL | null {
	if (!isTripPage(url)) {
		return null;
	}

	const tripSlug = url.pathname.slice(tripPathPrefix.length).split('/', 1)[0];
	return tripSlug ? new URL(`${tripPathPrefix}${tripSlug}`, url.origin) : null;
}

function isLegacyCacheTripPageMessage(value: unknown): value is LegacyCacheTripPageMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as { readonly type?: unknown; readonly url?: unknown };
	return message.type === 'cache-trip-page' && typeof message.url === 'string';
}

function cachedTripPagesRequest(value: unknown): CachedTripPagesRequest | null {
	if (isLegacyCacheTripPageMessage(value)) {
		return { homeUrl: null, urls: [value.url] };
	}

	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const message = value as { readonly type?: unknown; readonly homeUrl?: unknown; readonly urls?: unknown };
	if (
		message.type !== offlineMessageTypes.cacheTripPages ||
		!Array.isArray(message.urls) ||
		message.urls.length === 0 ||
		(message.homeUrl !== undefined && typeof message.homeUrl !== 'string')
	) {
		return null;
	}

	return message.urls.every((url) => typeof url === 'string')
		? { homeUrl: message.homeUrl ?? null, urls: message.urls }
		: null;
}

function isClearTripPagesMessage(value: unknown): value is ClearTripPagesMessage {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { readonly type?: unknown }).type === offlineMessageTypes.clearTripPages
	);
}

function isGetTripCacheStatusMessage(value: unknown): value is GetTripCacheStatusMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as { readonly type?: unknown; readonly url?: unknown };
	return message.type === offlineMessageTypes.getTripCacheStatus && typeof message.url === 'string';
}

function responseIsCacheableOfflineResource(request: Request, response: Response): boolean {
	return response.ok && !response.redirected && isOfflineViewerResource(new URL(request.url));
}

async function cacheOfflineResourceResponse(request: Request, response: Response): Promise<void> {
	const cache = await caches.open(offlineViewerCacheName);
	if (responseIsCacheableOfflineResource(request, response)) {
		await cache.put(request, response.clone());
	} else {
		await cache.delete(request);
	}
}

async function fetchAndCacheOfflineResource(request: Request): Promise<Response> {
	const response = await fetch(request);
	await cacheOfflineResourceResponse(request, response);
	return response;
}

function pageDataRequest(pageUrl: URL): Request {
	const pagePath = pageUrl.pathname === '/' ? '' : pageUrl.pathname.replace(/\/$/, '');
	return new Request(new URL(`${pagePath}/__data.json`, pageUrl.origin), { credentials: 'same-origin' });
}

async function cacheOfflinePage(pageUrl: URL): Promise<OfflinePageCacheResult> {
	const pageRequest = new Request(pageUrl, { credentials: 'same-origin' });
	const pageResponse = await fetchAndCacheOfflineResource(pageRequest);
	if (pageResponse.status === 403) {
		return 'not-authorized';
	}
	if (!responseIsCacheableOfflineResource(pageRequest, pageResponse)) {
		return 'failed';
	}

	const dataRequest = pageDataRequest(pageUrl);
	const dataResponse = await fetchAndCacheOfflineResource(dataRequest);
	if (dataResponse.status === 403) {
		return 'not-authorized';
	}
	return responseIsCacheableOfflineResource(dataRequest, dataResponse) ? 'cached' : 'failed';
}

async function cacheHomePage(url: string): Promise<boolean> {
	try {
		const homeUrl = new URL(url, worker.location.origin);
		if (homeUrl.origin !== worker.location.origin || !isHomePage(homeUrl)) {
			return false;
		}

		return (await cacheOfflinePage(homeUrl)) === 'cached';
	} catch {
		return false;
	}
}

function tripCacheStatusRequest(tripUrl: URL): Request {
	return new Request(new URL(`${tripCacheStatusPathPrefix}${encodeURIComponent(tripUrl.pathname)}`, tripUrl.origin));
}

async function setTripCacheStatus(tripUrl: URL, cached: boolean): Promise<void> {
	const cache = await caches.open(offlineViewerCacheName);
	const request = tripCacheStatusRequest(tripUrl);
	if (cached) {
		await cache.put(request, new Response());
	} else {
		await cache.delete(request);
	}
}

async function cacheTripPages(request: CachedTripPagesRequest): Promise<boolean> {
	const pageUrls = request.urls.map((url) => {
		const tripUrl = new URL(url, worker.location.origin);
		return tripUrl.origin === worker.location.origin && isTripPage(tripUrl) ? tripUrl : null;
	});
	const rootUrl = pageUrls[0] ? tripRootUrl(pageUrls[0]) : null;
	if (!rootUrl || pageUrls.some((url) => url === null)) {
		return false;
	}

	const results = await Promise.all(
		pageUrls.map(async (tripUrl) => {
			try {
				return await cacheOfflinePage(tripUrl);
			} catch {
				return 'failed' as const;
			}
		})
	);
	const pagesCached = results[0] === 'cached' && results.slice(1).every((result) => result !== 'failed');
	const homeCached = request.homeUrl ? await cacheHomePage(request.homeUrl) : true;
	const cached = pagesCached && homeCached;
	await setTripCacheStatus(rootUrl, cached);
	return cached;
}

function offlineResponse(): Response {
	return new Response(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${browserTitle(browserPages.offline)}</title></head><body><main><h1>You’re offline</h1><p>This page has not been saved on this device yet. Connect to the internet, open it once, then it will be available here offline.</p></main></body></html>`,
		{
			headers: {
				'cache-control': 'no-store',
				'content-type': 'text/html; charset=utf-8'
			},
			status: 503,
			statusText: 'Offline'
		}
	);
}

async function respondToOfflineViewerResource(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		const cache = await caches.open(offlineViewerCacheName);
		const cacheMatchOptions = isOfflineViewerDataRequest(new URL(request.url))
			? { ignoreSearch: true, ignoreVary: true }
			: undefined;
		return (await cache.match(request, cacheMatchOptions)) ?? offlineResponse();
	}
}

async function respondToApplicationAsset(request: Request): Promise<Response> {
	const cache = await caches.open(applicationCacheName);
	return (await cache.match(request)) ?? fetch(request);
}

async function clearOfflineTripPages(): Promise<void> {
	const cache = await caches.open(offlineViewerCacheName);
	const requests = await cache.keys();
	await Promise.all(requests.map((request) => cache.delete(request)));
}

async function migrateLegacyOfflineCaches(): Promise<void> {
	const offlineViewerCache = await caches.open(offlineViewerCacheName);
	const applicationCache = await caches.open(applicationCacheName);
	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames
			.filter(
				(existingCacheName) =>
					existingCacheName.startsWith(legacyCacheNamePrefix) && existingCacheName !== offlineViewerCacheName
			)
			.map(async (existingCacheName) => {
				const legacyCache = await caches.open(existingCacheName);
				const requests = await legacyCache.keys();
				await Promise.all(
					requests.map(async (request) => {
						const response = await legacyCache.match(request);
						if (!response) {
							return;
						}

						const targetCache = isTripPage(new URL(request.url)) ? offlineViewerCache : applicationCache;
						await targetCache.put(request, response);
					})
				);
				await caches.delete(existingCacheName);
			})
	);
}

async function hasSavedTrip(url: string): Promise<boolean> {
	try {
		const tripUrl = new URL(url, worker.location.origin);
		const rootUrl = tripUrl.origin === worker.location.origin ? tripRootUrl(tripUrl) : null;
		if (!rootUrl) {
			return false;
		}

		const cache = await caches.open(offlineViewerCacheName);
		return (await cache.match(tripCacheStatusRequest(rootUrl))) !== undefined;
	} catch {
		return false;
	}
}

function respondWithCacheStatus(port: MessagePort | undefined, cached: boolean): void {
	if (!port) {
		return;
	}

	const response: TripCacheStatusResponse = { type: offlineMessageTypes.tripCacheStatus, cached };
	port.postMessage(response);
}

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(applicationCacheName)
			.then((cache) => cache.addAll([...applicationAssets]))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		migrateLegacyOfflineCaches()
			.then(() => caches.open(applicationCacheName))
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('message', (event) => {
	if (isClearTripPagesMessage(event.data)) {
		event.waitUntil(clearOfflineTripPages());
		return;
	}

	if (isGetTripCacheStatusMessage(event.data)) {
		event.waitUntil(hasSavedTrip(event.data.url).then((cached) => respondWithCacheStatus(event.ports[0], cached)));
		return;
	}

	const request = cachedTripPagesRequest(event.data);
	if (!request) {
		return;
	}

	event.waitUntil(cacheTripPages(request).then((cached) => respondWithCacheStatus(event.ports[0], cached)));
});

worker.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== worker.location.origin) {
		return;
	}

	if (event.request.method === 'POST') {
		if (url.pathname === logoutPath) {
			event.waitUntil(clearOfflineTripPages());
		}
		return;
	}

	if (event.request.method !== 'GET') {
		return;
	}

	if (isApplicationAsset(url)) {
		event.respondWith(respondToApplicationAsset(event.request));
		return;
	}

	if (isOfflineViewerDataRequest(url)) {
		event.respondWith(respondToOfflineViewerResource(event.request));
		return;
	}

	if (event.request.mode === 'navigate' && (isHomePage(url) || isTripPage(url))) {
		event.respondWith(respondToOfflineViewerResource(event.request));
	}
});
