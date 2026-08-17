import { isAbsolute } from 'node:path';

export const minimumSetupTokenBytes = 32;

export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** Returns an actionable error when the initial-account token is unavailable or too short. */
export function setupTokenConfigurationError(environment: EnvironmentVariables, required: boolean): string | null {
	const configuredToken = environment.SHIORI_SETUP_TOKEN;
	if (!configuredToken) {
		return required ? 'SHIORI_SETUP_TOKEN must be configured before production setup.' : null;
	}
	if (Buffer.byteLength(configuredToken) < minimumSetupTokenBytes) {
		return `SHIORI_SETUP_TOKEN must contain at least ${minimumSetupTokenBytes} bytes.`;
	}
	return null;
}

function originConfigurationError(origin: string | undefined): string | null {
	if (!origin) {
		return 'ORIGIN must be set to Shiori’s public HTTPS origin.';
	}

	try {
		const url = new URL(origin);
		if (url.protocol !== 'https:') {
			return 'ORIGIN must use HTTPS.';
		}
		if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
			return 'ORIGIN must be an origin only, without credentials, a path, query, or fragment.';
		}
		return null;
	} catch {
		return 'ORIGIN must be an absolute URL, such as https://shiori.apasz.com.';
	}
}

/** Lists invalid settings that would otherwise make a production server unsafe or non-durable. */
export function productionConfigurationErrors(environment: EnvironmentVariables): readonly string[] {
	if (environment.NODE_ENV !== 'production') {
		return [];
	}

	const errors: string[] = [];
	const originError = originConfigurationError(environment.ORIGIN);
	if (originError) {
		errors.push(originError);
	}

	const dataDirectory = environment.SHIORI_DATA_DIRECTORY;
	if (!dataDirectory) {
		errors.push('SHIORI_DATA_DIRECTORY must point to a durable absolute directory.');
	} else if (!isAbsolute(dataDirectory)) {
		errors.push('SHIORI_DATA_DIRECTORY must be an absolute directory path.');
	}

	const setupTokenError = setupTokenConfigurationError(environment, true);
	if (setupTokenError) {
		errors.push(setupTokenError);
	}
	return errors;
}

/** Stops a configured production process before it can serve with unsafe or ephemeral settings. */
export function assertProductionConfiguration(environment: EnvironmentVariables): void {
	const errors = productionConfigurationErrors(environment);
	if (errors.length > 0) {
		throw new Error(`Invalid production configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`);
	}
}
