export type AnchoredPanelPlacement = Readonly<{
	maxHeight: string;
	opensAbove: boolean;
}>;

/** Calculates the largest viewport-safe side for a panel anchored to a control. */
export function viewportAnchoredPanelPlacement(anchor: HTMLElement, gapInRem: number): AnchoredPanelPlacement {
	const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
	const inset = rootFontSize;
	const gap = gapInRem * rootFontSize;
	const anchorBounds = anchor.getBoundingClientRect();
	const spaceAbove = Math.max(0, anchorBounds.top - inset - gap);
	const spaceBelow = Math.max(0, window.innerHeight - inset - anchorBounds.bottom - gap);

	return {
		maxHeight: `${Math.max(spaceAbove, spaceBelow)}px`,
		opensAbove: spaceAbove > spaceBelow
	};
}
