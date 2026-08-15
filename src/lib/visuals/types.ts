import type { Component } from 'svelte';

/** The supported visual sources. Add a source here before registering its assets. */
export const visualProviders = ['tabler', 'undraw', 'custom'] as const;

export type VisualProvider = (typeof visualProviders)[number];

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

export type VisualAsset = Readonly<{
	provider: VisualProvider;
	renderer: VisualRenderer;
}>;
