import { afterEach, describe, expect, it, vi } from 'vitest';

const privateEnvironment = vi.hoisted(() => ({
	GOOGLE_API_KEY: undefined as string | undefined,
	GOOGLE_KNOWLEDGE_GRAPH_API_KEY: undefined as string | undefined,
	GOOGLE_PLACES_API_KEY: undefined as string | undefined,
	GOOGLE_ROUTES_API_KEY: undefined as string | undefined,
	GOOGLE_TIME_ZONE_API_KEY: undefined as string | undefined
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

import { configuredGoogleApiKey, type GoogleApiDomain } from './google-api-key';
import { exampleEnvironmentValues } from './example-environment';

const domains: readonly GoogleApiDomain[] = ['places', 'knowledgeGraph', 'routes', 'timeZone'];

afterEach(() => {
	privateEnvironment.GOOGLE_API_KEY = undefined;
	privateEnvironment.GOOGLE_KNOWLEDGE_GRAPH_API_KEY = undefined;
	privateEnvironment.GOOGLE_PLACES_API_KEY = undefined;
	privateEnvironment.GOOGLE_ROUTES_API_KEY = undefined;
	privateEnvironment.GOOGLE_TIME_ZONE_API_KEY = undefined;
});

describe('Google API key configuration', () => {
	it('uses GOOGLE_API_KEY as the shared default for every Google API domain', () => {
		privateEnvironment.GOOGLE_API_KEY = ' shared-key ';

		for (const domain of domains) {
			expect(configuredGoogleApiKey(domain)).toBe('shared-key');
		}
	});

	it('prefers each domain-specific key over the shared default', () => {
		privateEnvironment.GOOGLE_API_KEY = 'shared-key';
		privateEnvironment.GOOGLE_KNOWLEDGE_GRAPH_API_KEY = 'knowledge-graph-key';
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'places-key';
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'routes-key';
		privateEnvironment.GOOGLE_TIME_ZONE_API_KEY = 'time-zone-key';

		expect(configuredGoogleApiKey('knowledgeGraph')).toBe('knowledge-graph-key');
		expect(configuredGoogleApiKey('places')).toBe('places-key');
		expect(configuredGoogleApiKey('routes')).toBe('routes-key');
		expect(configuredGoogleApiKey('timeZone')).toBe('time-zone-key');
	});

	it('does not use a key configured for another domain', () => {
		privateEnvironment.GOOGLE_PLACES_API_KEY = 'places-key';
		privateEnvironment.GOOGLE_ROUTES_API_KEY = 'routes-key';

		expect(configuredGoogleApiKey('knowledgeGraph')).toBeUndefined();
		expect(configuredGoogleApiKey('timeZone')).toBeUndefined();
	});

	it('ignores the public API-key placeholders from the environment example', () => {
		privateEnvironment.GOOGLE_API_KEY = exampleEnvironmentValues.GOOGLE_API_KEY;
		privateEnvironment.GOOGLE_PLACES_API_KEY = exampleEnvironmentValues.GOOGLE_PLACES_API_KEY;

		for (const domain of domains) {
			expect(configuredGoogleApiKey(domain)).toBeUndefined();
		}
	});
});
