import environmentExample from '../../../.env.example?raw';

export const exampleEnvironmentVariableNames = [
	'SHIORI_SETUP_TOKEN',
	'AERODATABOX_API_KEY',
	'AERODATABOX_DIRECT_API_KEY',
	'GOOGLE_API_KEY',
	'GOOGLE_PLACES_API_KEY',
	'GOOGLE_KNOWLEDGE_GRAPH_API_KEY',
	'GOOGLE_ROUTES_API_KEY',
	'GOOGLE_TIME_ZONE_API_KEY'
] as const;

export type ExampleEnvironmentVariableName = (typeof exampleEnvironmentVariableNames)[number];

function exampleValue(variableName: ExampleEnvironmentVariableName): string {
	const assignment = new RegExp(`^\\s*(?:#\\s*)?${variableName}=(?<value>[^\\r\\n]*)$`, 'm').exec(environmentExample);
	const value = assignment?.groups?.value?.trim();
	if (!value) {
		throw new Error(`.env.example must define a placeholder for ${variableName}.`);
	}
	return value;
}

export const exampleEnvironmentValues = Object.fromEntries(
	exampleEnvironmentVariableNames.map((variableName) => [variableName, exampleValue(variableName)])
) as Readonly<Record<ExampleEnvironmentVariableName, string>>;

/** Returns whether a configured value is the public placeholder committed in .env.example. */
export function isExampleEnvironmentValue(variableName: ExampleEnvironmentVariableName, value: string): boolean {
	return value.trim() === exampleEnvironmentValues[variableName];
}
