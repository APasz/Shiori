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
const offlineViewerCacheNamePrefix = 'shiori:offline:viewer:';
const legacyCacheNamePrefix = 'shiori:offline:';
const applicationAssets = new Set([...build, ...files]);
const immutableAssetPathPrefix = `${base}/_app/immutable/`;
const tripPathPrefix = `${base}/trips/`;
const tripDataPathSuffix = '/__data.json';
const loginPath = `${base}/login`;
const logoutPath = `${base}/logout`;
const offlineViewerPath = `${base}/api/offline/viewer`;
const tripCacheStatusPathPrefix = `${base}/__offline-trip-cache-status/`;
const maximumTrackedViewerClients = 1_000;

type CachedTripPagesRequest = {
	readonly homeUrl: string | null;
	readonly urls: readonly string[];
};

type OfflinePageCacheResult = 'cached' | 'not-authorized' | 'failed';

const viewerIdsByClientId = new Map<string, string>();

function isViewerId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function offlineViewerCacheName(viewerId: string): string {
	return `${offlineViewerCacheNamePrefix}${encodeURIComponent(viewerId)}`;
}

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

function cachedTripPagesRequest(value: unknown): CachedTripPagesRequest | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const message = value as {
		readonly type?: unknown;
		readonly homeUrl?: unknown;
		readonly urls?: unknown;
	};
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

function removedTripPagesRootUrl(value: unknown): URL | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const message = value as { readonly type?: unknown; readonly url?: unknown };
	if (message.type !== offlineMessageTypes.removeTripPages || typeof message.url !== 'string') {
		return null;
	}

	try {
		const url = new URL(message.url, worker.location.origin);
		return url.origin === worker.location.origin ? tripRootUrl(url) : null;
	} catch {
		return null;
	}
}

function responseIsCacheableOfflineResource(request: Request, response: Response): boolean {
	return response.ok && !response.redirected && isOfflineViewerResource(new URL(request.url));
}

async function cacheOfflineResourceResponse(viewerId: string, request: Request, response: Response): Promise<void> {
	const cache = await caches.open(offlineViewerCacheName(viewerId));
	if (responseIsCacheableOfflineResource(request, response)) {
		await cache.put(request, response.clone());
	} else {
		await cache.delete(request);
	}
}

async function fetchAndCacheOfflineResource(viewerId: string, request: Request): Promise<Response> {
	const response = await fetch(request);
	await cacheOfflineResourceResponse(viewerId, request, response);
	return response;
}

function pageDataRequest(pageUrl: URL): Request {
	const pagePath = pageUrl.pathname === '/' ? '' : pageUrl.pathname.replace(/\/$/, '');
	return new Request(new URL(`${pagePath}/__data.json`, pageUrl.origin), { credentials: 'same-origin' });
}

async function cacheOfflinePage(viewerId: string, pageUrl: URL): Promise<OfflinePageCacheResult> {
	const pageRequest = new Request(pageUrl, { credentials: 'same-origin' });
	const pageResponse = await fetchAndCacheOfflineResource(viewerId, pageRequest);
	if (pageResponse.status === 403) {
		return 'not-authorized';
	}
	if (!responseIsCacheableOfflineResource(pageRequest, pageResponse)) {
		return 'failed';
	}

	const dataRequest = pageDataRequest(pageUrl);
	const dataResponse = await fetchAndCacheOfflineResource(viewerId, dataRequest);
	if (dataResponse.status === 403) {
		return 'not-authorized';
	}
	return responseIsCacheableOfflineResource(dataRequest, dataResponse) ? 'cached' : 'failed';
}

async function cacheHomePage(viewerId: string, url: string): Promise<boolean> {
	try {
		const homeUrl = new URL(url, worker.location.origin);
		if (homeUrl.origin !== worker.location.origin || !isHomePage(homeUrl)) {
			return false;
		}

		return (await cacheOfflinePage(viewerId, homeUrl)) === 'cached';
	} catch {
		return false;
	}
}

function tripCacheStatusRequest(tripUrl: URL): Request {
	return new Request(new URL(`${tripCacheStatusPathPrefix}${encodeURIComponent(tripUrl.pathname)}`, tripUrl.origin));
}

async function setTripCacheStatus(viewerId: string, tripUrl: URL, cached: boolean): Promise<void> {
	const cache = await caches.open(offlineViewerCacheName(viewerId));
	const request = tripCacheStatusRequest(tripUrl);
	if (cached) {
		await cache.put(request, new Response());
	} else {
		await cache.delete(request);
	}
}

async function cacheTripPages(viewerId: string, request: CachedTripPagesRequest): Promise<boolean> {
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
				return await cacheOfflinePage(viewerId, tripUrl);
			} catch {
				return 'failed' as const;
			}
		})
	);
	const pagesCached = results[0] === 'cached' && results.slice(1).every((result) => result !== 'failed');
	const homeCached = request.homeUrl ? await cacheHomePage(viewerId, request.homeUrl) : true;
	const cached = pagesCached && homeCached;
	await setTripCacheStatus(viewerId, rootUrl, cached);
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

async function clearOfflineViewerCache(viewerId: string): Promise<void> {
	await caches.delete(offlineViewerCacheName(viewerId));
}

async function respondToOfflineViewerResource(request: Request, viewerId: string | undefined): Promise<Response> {
	try {
		const response = await fetch(request);
		if (viewerId && (response.redirected || response.status === 401 || response.status === 403)) {
			await clearOfflineViewerCache(viewerId);
		}
		return response;
	} catch {
		if (!viewerId) {
			return offlineResponse();
		}
		const cache = await caches.open(offlineViewerCacheName(viewerId));
		const cacheMatchOptions = isOfflineViewerDataRequest(new URL(request.url)) ? { ignoreSearch: true } : undefined;
		return (await cache.match(request, cacheMatchOptions)) ?? offlineResponse();
	}
}

async function respondToApplicationAsset(request: Request): Promise<Response> {
	const cache = await caches.open(applicationCacheName);
	return (await cache.match(request)) ?? fetch(request);
}

async function clearOfflineTripPages(): Promise<void> {
	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames
			.filter((cacheName) => cacheName.startsWith(offlineViewerCacheNamePrefix))
			.map((cacheName) => caches.delete(cacheName))
	);
	viewerIdsByClientId.clear();
}

async function removeOfflineTripPages(viewerId: string, rootUrl: URL): Promise<void> {
	const cache = await caches.open(offlineViewerCacheName(viewerId));
	const requests = await cache.keys();
	await Promise.all(
		requests
			.filter((request) => {
				const url = new URL(request.url);
				return isHomePage(url) || isHomeDataRequest(url) || tripRootUrl(url)?.pathname === rootUrl.pathname;
			})
			.map((request) => cache.delete(request))
	);
	await cache.delete(tripCacheStatusRequest(rootUrl));
}

async function migrateLegacyOfflineCaches(): Promise<void> {
	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames
			.filter(
				(existingCacheName) =>
					existingCacheName.startsWith(legacyCacheNamePrefix) &&
					!existingCacheName.startsWith(offlineViewerCacheNamePrefix)
			)
			.map((existingCacheName) => caches.delete(existingCacheName))
	);
}

async function hasSavedTrip(viewerId: string, url: string): Promise<boolean> {
	try {
		const tripUrl = new URL(url, worker.location.origin);
		const rootUrl = tripUrl.origin === worker.location.origin ? tripRootUrl(tripUrl) : null;
		if (!rootUrl) {
			return false;
		}

		const cache = await caches.open(offlineViewerCacheName(viewerId));
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

function sourceClientId(event: ExtendableMessageEvent): string | undefined {
	const source = event.source as { readonly id?: unknown } | null;
	return typeof source?.id === 'string' ? source.id : undefined;
}

function rememberViewerId(clientId: string, viewerId: string): void {
	while (!viewerIdsByClientId.has(clientId) && viewerIdsByClientId.size >= maximumTrackedViewerClients) {
		const oldestClientId = viewerIdsByClientId.keys().next().value;
		if (oldestClientId === undefined) {
			break;
		}
		viewerIdsByClientId.delete(oldestClientId);
	}
	viewerIdsByClientId.set(clientId, viewerId);
}

async function viewerIdForMessage(event: ExtendableMessageEvent): Promise<string | undefined> {
	const clientId = sourceClientId(event);
	if (!clientId) {
		return undefined;
	}

	const response = await fetch(
		new Request(new URL(offlineViewerPath, worker.location.origin), {
			cache: 'no-store',
			credentials: 'same-origin'
		})
	);
	const viewer = (await response.json().catch(() => null)) as { readonly viewerId?: unknown } | null;
	if (!response.ok || !isViewerId(viewer?.viewerId)) {
		const previousViewerId = viewerIdsByClientId.get(clientId);
		viewerIdsByClientId.delete(clientId);
		if (previousViewerId) {
			await clearOfflineViewerCache(previousViewerId);
		}
		return undefined;
	}

	const previousViewerId = viewerIdsByClientId.get(clientId);
	if (previousViewerId && previousViewerId !== viewer.viewerId) {
		await clearOfflineViewerCache(previousViewerId);
	}
	rememberViewerId(clientId, viewer.viewerId);
	return viewer.viewerId;
}

function viewerIdForFetch(event: FetchEvent): string | undefined {
	return viewerIdsByClientId.get(event.clientId) ?? viewerIdsByClientId.get(event.resultingClientId);
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

	const removedTripRootUrl = removedTripPagesRootUrl(event.data);
	if (removedTripRootUrl) {
		event.waitUntil(
			viewerIdForMessage(event)
				.then((viewerId) => (viewerId ? removeOfflineTripPages(viewerId, removedTripRootUrl) : undefined))
				.catch(() => undefined)
		);
		return;
	}

	if (isGetTripCacheStatusMessage(event.data)) {
		event.waitUntil(
			viewerIdForMessage(event)
				.then((viewerId) => (viewerId ? hasSavedTrip(viewerId, event.data.url) : false))
				.catch(() => false)
				.then((cached) => respondWithCacheStatus(event.ports[0], cached))
		);
		return;
	}

	const request = cachedTripPagesRequest(event.data);
	if (!request) {
		return;
	}

	event.waitUntil(
		viewerIdForMessage(event)
			.then((viewerId) => (viewerId ? cacheTripPages(viewerId, request) : false))
			.catch(() => false)
			.then((cached) => respondWithCacheStatus(event.ports[0], cached))
	);
});

worker.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== worker.location.origin) {
		return;
	}

	if (event.request.method === 'POST') {
		if (url.pathname === loginPath || url.pathname === logoutPath) {
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
		event.respondWith(respondToOfflineViewerResource(event.request, viewerIdForFetch(event)));
		return;
	}

	if (event.request.mode === 'navigate' && (isHomePage(url) || isTripPage(url))) {
		event.respondWith(respondToOfflineViewerResource(event.request, viewerIdForFetch(event)));
	}
});
