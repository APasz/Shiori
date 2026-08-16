const maximumIllustrationWidth = 176;
const minimumIllustrationWidth = 66;

/** The rendered square artwork height, shared with `ItineraryItemIllustration`. */
export const itemIllustrationHeight = 48;

export type ItemIllustrationLayout = Readonly<{
	overlapsTitle: boolean;
	width: number;
}>;

/**
 * Keeps the square artwork's visible edge aligned while its surrounding SVG canvas has room to shrink.
 * SVG preserves the artwork's aspect ratio, so the unused horizontal canvas must not trigger a resize.
 */
export function itemIllustrationLayout(availableWidth: number): ItemIllustrationLayout {
	const alignedWidth = (maximumIllustrationWidth + itemIllustrationHeight) / 2;
	const minimumReadableWidth = (minimumIllustrationWidth + itemIllustrationHeight) / 2;
	const width =
		availableWidth >= alignedWidth
			? maximumIllustrationWidth
			: Math.min(
					maximumIllustrationWidth,
					Math.max(minimumIllustrationWidth, 2 * (availableWidth - itemIllustrationHeight / 2))
				);

	return {
		overlapsTitle: availableWidth < minimumReadableWidth,
		width
	};
}
