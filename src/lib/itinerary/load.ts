import { parse } from 'yaml';
import { formatValidationIssues } from '$lib/validation';
import { itinerarySchema, type Itinerary } from './schema';

export type ItineraryLoadResult =
	| { readonly valid: true; readonly itinerary: Itinerary }
	| { readonly valid: false; readonly error: string };

/** Parses untrusted YAML and returns either a validated itinerary or a display-safe error. */
export function loadItinerary(source: string): ItineraryLoadResult {
	try {
		const parsedYaml: unknown = parse(source);
		const result = itinerarySchema.safeParse(parsedYaml);

		if (!result.success) {
			return { valid: false, error: formatValidationIssues(result.error.issues) };
		}

		return { valid: true, itinerary: result.data };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown YAML parsing error.';
		return { valid: false, error: `YAML could not be parsed: ${message}` };
	}
}
