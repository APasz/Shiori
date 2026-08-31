import { applicationTitle } from '$lib/browser-title';

export const openGraphType = 'website';

export type OpenGraphMetadataInput = Readonly<{
	description: string;
	tripTitle: string;
}>;

export type OpenGraphMetadata = Readonly<{
	description: string;
	siteName: string;
	title: string;
	type: typeof openGraphType;
	url: string;
}>;

function canonicalUrl(url: URL): string {
	const canonical = new URL(url);
	canonical.hash = '';
	canonical.search = '';
	return canonical.href;
}

/** Creates the metadata used by social clients when they unfurl an itinerary link. */
export function tripOpenGraphMetadata(input: OpenGraphMetadataInput, url: URL): OpenGraphMetadata {
	return {
		description: input.description,
		siteName: applicationTitle,
		title: `${applicationTitle} Itinerary: ${input.tripTitle}`,
		type: openGraphType,
		url: canonicalUrl(url)
	};
}
