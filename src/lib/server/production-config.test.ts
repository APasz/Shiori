import { describe, expect, it } from 'vitest';
import {
	assertProductionConfiguration,
	minimumSetupTokenBytes,
	productionConfigurationErrors,
	setupTokenConfigurationError,
	type EnvironmentVariables
} from './production-config';

function productionEnvironment(overrides: EnvironmentVariables = {}): EnvironmentVariables {
	return {
		NODE_ENV: 'production',
		ORIGIN: 'https://shiori.apasz.com',
		SHIORI_DATA_DIRECTORY: '/var/lib/shiori',
		SHIORI_SETUP_TOKEN: 'a'.repeat(minimumSetupTokenBytes),
		...overrides
	};
}

describe('production configuration', () => {
	it('accepts an explicit HTTPS origin, durable data directory, and strong setup token', () => {
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
			'SHIORI_SETUP_TOKEN must be configured before production setup.'
		]);
	});

	it('rejects an insecure origin and a relative data directory', () => {
		expect(
			productionConfigurationErrors(
				productionEnvironment({ ORIGIN: 'http://shiori.apasz.com', SHIORI_DATA_DIRECTORY: 'data' })
			)
		).toEqual(['ORIGIN must use HTTPS.', 'SHIORI_DATA_DIRECTORY must be an absolute directory path.']);
	});

	it('uses the same minimum token policy during development setup', () => {
		expect(setupTokenConfigurationError({}, false)).toBeNull();
		expect(setupTokenConfigurationError({ SHIORI_SETUP_TOKEN: 'short' }, false)).toBe(
			`SHIORI_SETUP_TOKEN must contain at least ${minimumSetupTokenBytes} bytes.`
		);
	});
});
