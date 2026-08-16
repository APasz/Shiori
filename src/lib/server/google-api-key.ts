import { env } from '$env/dynamic/private';

export type GoogleApiDomain = 'knowledgeGraph' | 'places' | 'routes' | 'timeZone';
type GoogleApiKeyEnvironmentVariable =
	| 'GOOGLE_API_KEY'
	| 'GOOGLE_KNOWLEDGE_GRAPH_API_KEY'
	| 'GOOGLE_PLACES_API_KEY'
	| 'GOOGLE_ROUTES_API_KEY'
	| 'GOOGLE_TIME_ZONE_API_KEY';

const apiKeyEnvironmentVariables: Readonly<Record<GoogleApiDomain, readonly GoogleApiKeyEnvironmentVariable[]>> = {
	knowledgeGraph: ['GOOGLE_KNOWLEDGE_GRAPH_API_KEY', 'GOOGLE_API_KEY'],
	places: ['GOOGLE_PLACES_API_KEY', 'GOOGLE_API_KEY'],
	routes: ['GOOGLE_ROUTES_API_KEY', 'GOOGLE_API_KEY'],
	timeZone: ['GOOGLE_TIME_ZONE_API_KEY', 'GOOGLE_API_KEY']
};

/** Returns the first non-empty API key configured for the requested Google API domain. */
export function configuredGoogleApiKey(domain: GoogleApiDomain): string | undefined {
	for (const environmentVariable of apiKeyEnvironmentVariables[domain]) {
		const apiKey = env[environmentVariable]?.trim();
		if (apiKey) {
			return apiKey;
		}
	}
	return undefined;
}
