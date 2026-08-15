import type { Component } from 'svelte';

/**
 * Identifies the source that supplied an asset. Provider names are deliberately
 * open-ended so registry entries can use any icon pack or local artwork.
 */
export type VisualProvider = string;

/** Props that every provider adapter must accept. */
export type VisualRendererProps = {
	class?: string;
	color?: string;
	size?: number | string;
	stroke?: number | string;
	'aria-hidden'?: boolean;
	'aria-label'?: string;
	focusable?: boolean;
	role?: 'img';
};

/**
 * Provider components are adapted to this contract before entering the registry.
 * This lets icon packs and local SVG components coexist behind the same API.
 */
export type VisualRenderer = Component<VisualRendererProps>;

export type VisualAsset<TProvider extends VisualProvider = VisualProvider> = Readonly<{
	provider: TProvider;
	renderer: VisualRenderer;
}>;

/** Creates an asset entry without coupling the registry to a particular provider. */
export function visualAsset<TProvider extends VisualProvider>(
	provider: TProvider,
	renderer: VisualRenderer
): VisualAsset<TProvider> {
	return { provider, renderer };
}
