import { describe, expect, it } from 'vitest';
import {
	assertProductionConfiguration,
	minimumSetupTokenBytes,
	productionConfigurationErrors,
	setupTokenConfigurationError,
	type EnvironmentVariables
} from './production-config';
import { exampleEnvironmentValues } from './example-environment';

function productionEnvironment(overrides: EnvironmentVariables = {}): EnvironmentVariables {
	return {
		NODE_ENV: 'production',
		ORIGIN: 'https://shiori.apasz.com',
		BODY_SIZE_LIMIT: '20M',
		SHIORI_DATA_DIRECTORY: '/var/lib/shiori',
		SHIORI_SETUP_TOKEN: 'a'.repeat(minimumSetupTokenBytes),
		...overrides
	};
}

describe('production configuration', () => {
	it('accepts an explicit HTTPS origin, durable data directory, strong setup token, and backup body limit', () => {
		expect(productionConfigurationErrors(productionEnvironment())).toEqual([]);
		expect(() => assertProductionConfiguration(productionEnvironment())).not.toThrow();
	});

	it('does not impose production settings outside the production runtime', () => {
		expect(productionConfigurationErrors({ NODE_ENV: 'development' })).toEqual([]);
	});

	it('reports every missing production setting together', () => {
		expect(productionConfigurationErrors({ NODE_ENV: 'production' })).toEqual([
			'ORIGIN must be set to Shiori’s public HTTPS origin.',
			'SHIORI_DATA_DIRECTORY must point to a durable absolute directory.',
			'SHIORI_SETUP_TOKEN must be configured before production setup.',
			'BODY_SIZE_LIMIT must be a valid size of at least 20 MB.'
		]);
	});

	it('rejects an insecure origin and a relative data directory', () => {
		expect(
			productionConfigurationErrors(
				productionEnvironment({ ORIGIN: 'http://shiori.apasz.com', SHIORI_DATA_DIRECTORY: 'data' })
			)
		).toEqual(['ORIGIN must use HTTPS.', 'SHIORI_DATA_DIRECTORY must be an absolute directory path.']);
	});

	it('rejects an invalid or undersized body limit for trip backup imports', () => {
		expect(productionConfigurationErrors(productionEnvironment({ BODY_SIZE_LIMIT: '512K' }))).toEqual([
			'BODY_SIZE_LIMIT must be a valid size of at least 20 MB.'
		]);
		expect(productionConfigurationErrors(productionEnvironment({ BODY_SIZE_LIMIT: 'twenty megabytes' }))).toEqual([
			'BODY_SIZE_LIMIT must be a valid size of at least 20 MB.'
		]);
	});

	it('uses the same minimum token policy during development setup', () => {
		expect(setupTokenConfigurationError({}, false)).toBeNull();
		expect(setupTokenConfigurationError({ SHIORI_SETUP_TOKEN: 'short' }, false)).toBe(
			`SHIORI_SETUP_TOKEN must contain at least ${minimumSetupTokenBytes} bytes.`
		);
	});

	it('rejects the public setup-token placeholder from the environment example', () => {
		expect(
			setupTokenConfigurationError({ SHIORI_SETUP_TOKEN: exampleEnvironmentValues.SHIORI_SETUP_TOKEN }, true)
		).toBe('SHIORI_SETUP_TOKEN must be replaced with a unique random secret.');
	});

	it('rejects public API-key placeholders from the environment example', () => {
		expect(
			productionConfigurationErrors(
				productionEnvironment({
					AERODATABOX_API_KEY: exampleEnvironmentValues.AERODATABOX_API_KEY,
					GOOGLE_API_KEY: exampleEnvironmentValues.GOOGLE_API_KEY
				})
			)
		).toEqual([
			'AERODATABOX_API_KEY must be replaced with a real key or removed.',
			'GOOGLE_API_KEY must be replaced with a real key or removed.'
		]);
	});
});
