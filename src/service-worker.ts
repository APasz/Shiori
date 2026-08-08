import { base, build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const cacheName = `shiori:offline:${version}`;
const cacheNamePrefix = 'shiori:offline:';
const applicationAssets = new Set([...build, ...files]);
const tripPathPrefix = `${base}/trips/`;
const logoutPath = `${base}/logout`;

type CacheTripPageMessage = {
	readonly type: 'cache-trip-page';
	readonly url: string;
};

type ClearOfflineTripPagesMessage = {
	readonly type: 'clear-offline-trip-pages';
};

function isTripPage(url: URL): boolean {
	return url.pathname.startsWith(tripPathPrefix) && url.pathname.length > tripPathPrefix.length;
}

function isCacheTripPageMessage(value: unknown): value is CacheTripPageMessage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as { readonly type?: unknown; readonly url?: unknown };
	return message.type === 'cache-trip-page' && typeof message.url === 'string';
}

function isClearOfflineTripPagesMessage(value: unknown): value is ClearOfflineTripPagesMessage {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { readonly type?: unknown }).type === 'clear-offline-trip-pages'
	);
}

function responseIsCacheableTripPage(response: Response): boolean {
	return response.ok && isTripPage(new URL(response.url));
}

async function cacheTripResponse(request: Request, response: Response): Promise<void> {
	const cache = await caches.open(cacheName);
	if (responseIsCacheableTripPage(response)) {
		await cache.put(request, response.clone());
	} else {
		await cache.delete(request);
	}
}

async function fetchAndCacheTripPage(request: Request): Promise<Response> {
	const response = await fetch(request);
	await cacheTripResponse(request, response);
	return response;
}

function offlineResponse(): Response {
	return new Response(
		'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shiori is offline</title></head><body><main><h1>You’re offline</h1><p>This itinerary has not been saved on this device yet. Connect to the internet, open it once, then it will be available here offline.</p></main></body></html>',
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

async function respondToTripNavigation(request: Request): Promise<Response> {
	try {
		return await fetchAndCacheTripPage(request);
	} catch {
		const cache = await caches.open(cacheName);
		return (await cache.match(request)) ?? offlineResponse();
	}
}

async function respondToApplicationAsset(request: Request): Promise<Response> {
	const cache = await caches.open(cacheName);
	return (await cache.match(request)) ?? fetch(request);
}

async function clearOfflineTripPages(): Promise<void> {
	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames
			.filter((existingCacheName) => existingCacheName.startsWith(cacheNamePrefix))
			.map(async (existingCacheName) => {
				const cache = await caches.open(existingCacheName);
				const requests = await cache.keys();
				await Promise.all(
					requests.filter((request) => isTripPage(new URL(request.url))).map((request) => cache.delete(request))
				);
			})
	);
}

async function clearStaleOfflineCaches(): Promise<void> {
	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames
			.filter((existingCacheName) => existingCacheName.startsWith(cacheNamePrefix) && existingCacheName !== cacheName)
			.map((existingCacheName) => caches.delete(existingCacheName))
	);
}

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(cacheName)
			.then((cache) => cache.addAll([...applicationAssets]))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		clearStaleOfflineCaches()
			.then(() => caches.open(cacheName))
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('message', (event) => {
	if (isClearOfflineTripPagesMessage(event.data)) {
		event.waitUntil(clearOfflineTripPages());
		return;
	}

	if (!isCacheTripPageMessage(event.data)) {
		return;
	}

	const url = new URL(event.data.url, worker.location.origin);
	if (url.origin !== worker.location.origin || !isTripPage(url)) {
		return;
	}

	event.waitUntil(fetchAndCacheTripPage(new Request(url, { credentials: 'same-origin' })).catch(() => undefined));
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

	if (applicationAssets.has(url.pathname)) {
		event.respondWith(respondToApplicationAsset(event.request));
		return;
	}

	if (event.request.mode === 'navigate' && isTripPage(url)) {
		event.respondWith(respondToTripNavigation(event.request));
	}
});
