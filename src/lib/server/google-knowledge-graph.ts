import { env } from '$env/dynamic/private';
import { z } from 'zod';
import {
	ExpiringCache,
	ProviderRateLimitError,
	ProviderRequestCoordinator,
	throwIfRateLimited
} from '$lib/server/external-api';

const knowledgeGraphSearchEndpoint = 'https://kgsearch.googleapis.com/v1/entities:search';
const cacheLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1_000;
const cacheMaximumEntries = 1_000;
const fallbackRetryDelayMilliseconds = 1_000;
const requestTimeoutMilliseconds = 5_000;
const knowledgeGraphIdPattern = /^\/g\/[A-Za-z0-9_-]+$/;

const knowledgeGraphEntitySchema = z.object({
	'@id': z.string().regex(knowledgeGraphIdPattern),
	'@type': z.array(z.string().trim().min(1)).optional(),
	name: z.string().trim().min(1)
});
const knowledgeGraphResponseSchema = z
	.object({
		itemListElement: z.array(z.object({ result: knowledgeGraphEntitySchema })).optional()
	})
	.passthrough();

export type GoogleKnowledgeGraphEntity = Readonly<{
	id: string;
	name: string;
	types: readonly string[];
}>;

const entityCache = new ExpiringCache<GoogleKnowledgeGraphEntity>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<GoogleKnowledgeGraphEntity | null>({
	fallbackRetryDelayMilliseconds,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});

function configuredApiKey(): string | undefined {
	const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
	return apiKey || undefined;
}

function entityFromResponse(payload: unknown, id: string): GoogleKnowledgeGraphEntity | null {
	const response = knowledgeGraphResponseSchema.safeParse(payload);
	if (!response.success) {
		return null;
	}
	const entities = response.data.itemListElement?.map((item) => item.result).filter((entity) => entity['@id'] === id);
	if (entities?.length !== 1) {
		return null;
	}
	const entity = entities[0];
	if (!entity) {
		return null;
	}
	return {
		id: entity['@id'],
		name: entity.name,
		types: entity['@type'] ?? []
	};
}

async function fetchGoogleKnowledgeGraphEntity(id: string, apiKey: string): Promise<GoogleKnowledgeGraphEntity | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		const url = new URL(knowledgeGraphSearchEndpoint);
		url.searchParams.set('ids', id);
		url.searchParams.set('languages', 'en');
		url.searchParams.set('key', apiKey);
		const response = await throwIfRateLimited(await fetch(url, { signal: controller.signal }));
		if (!response.ok) {
			console.warn('Google Knowledge Graph lookup failed.', { responseStatus: response.status });
			await response.body?.cancel().catch(() => undefined);
			return null;
		}
		return entityFromResponse(await response.json().catch(() => null), id);
	} finally {
		clearTimeout(timeout);
	}
}

/** Resolves a stable Google Knowledge Graph ID when the configured key permits the service. */
export async function lookupGoogleKnowledgeGraphEntity(id: string): Promise<GoogleKnowledgeGraphEntity | null> {
	if (!knowledgeGraphIdPattern.test(id)) {
		return null;
	}
	const apiKey = configuredApiKey();
	if (!apiKey) {
		return null;
	}
	const cached = entityCache.get(id);
	if (cached) {
		return cached;
	}
	try {
		const entity = await providerRequests.run(id, () => fetchGoogleKnowledgeGraphEntity(id, apiKey));
		if (entity) {
			entityCache.set(id, entity);
		}
		return entity;
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('Google Knowledge Graph lookup remained rate limited after retry.', { responseStatus: 429 });
		} else {
			console.warn('Google Knowledge Graph lookup could not be completed.', {
				failure: error instanceof Error ? error.name : 'UnknownError'
			});
		}
		return null;
	}
}
