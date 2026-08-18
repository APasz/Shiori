import { isAbsolute } from 'node:path';
import { maximumTripBackupBytes, maximumTripBackupSizeLabel } from '$lib/trip-backup';
import { exampleEnvironmentVariableNames, isExampleEnvironmentValue } from './example-environment';

export const minimumSetupTokenBytes = 32;

export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** Returns an actionable error when the initial-account token is unavailable or too short. */
export function setupTokenConfigurationError(environment: EnvironmentVariables, required: boolean): string | null {
	const configuredToken = environment.SHIORI_SETUP_TOKEN;
	if (!configuredToken) {
		return required ? 'SHIORI_SETUP_TOKEN must be configured before production setup.' : null;
	}
	if (isExampleEnvironmentValue('SHIORI_SETUP_TOKEN', configuredToken)) {
		return 'SHIORI_SETUP_TOKEN must be replaced with a unique random secret.';
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

function configuredByteSize(value: string | undefined): number | null {
	if (!value) {
		return null;
	}

	const match = /^(?<amount>\d+(?:\.\d+)?)(?<unit>[KMG])?$/i.exec(value.trim());
	if (!match?.groups) {
		return null;
	}

	const amount = Number(match.groups.amount);
	const multiplier =
		match.groups.unit?.toUpperCase() === 'G'
			? 1024 * 1024 * 1024
			: match.groups.unit?.toUpperCase() === 'M'
				? 1024 * 1024
				: match.groups.unit?.toUpperCase() === 'K'
					? 1024
					: 1;
	const bytes = amount * multiplier;
	return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

function bodySizeLimitConfigurationError(bodySizeLimit: string | undefined): string | null {
	const configuredLimit = configuredByteSize(bodySizeLimit);
	if (configuredLimit === null || configuredLimit < maximumTripBackupBytes) {
		return `BODY_SIZE_LIMIT must be a valid size of at least ${maximumTripBackupSizeLabel}.`;
	}
	return null;
}

function exampleApiKeyConfigurationErrors(environment: EnvironmentVariables): readonly string[] {
	return exampleEnvironmentVariableNames
		.filter((variableName) => variableName !== 'SHIORI_SETUP_TOKEN')
		.flatMap((variableName) => {
			const value = environment[variableName];
			return value && isExampleEnvironmentValue(variableName, value)
				? [`${variableName} must be replaced with a real key or removed.`]
				: [];
		});
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

	const bodySizeLimitError = bodySizeLimitConfigurationError(environment.BODY_SIZE_LIMIT);
	if (bodySizeLimitError) {
		errors.push(bodySizeLimitError);
	}
	errors.push(...exampleApiKeyConfigurationErrors(environment));
	return errors;
}

/** Stops a configured production process before it can serve with unsafe or ephemeral settings. */
export function assertProductionConfiguration(environment: EnvironmentVariables): void {
	const errors = productionConfigurationErrors(environment);
	if (errors.length > 0) {
		throw new Error(`Invalid production configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`);
	}
}
