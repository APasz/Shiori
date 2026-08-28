import { z } from 'zod';

export const customColourwayNames = ['ocean', 'violet', 'sunset'] as const;
export const colourwayNames = ['classic', ...customColourwayNames] as const;
export type Colourway = (typeof colourwayNames)[number];
export type CustomColourway = (typeof customColourwayNames)[number];

export const defaultColourway = 'classic' as const satisfies Colourway;
export const colourwaySchema = z.enum(colourwayNames);
export const customColourwaySchema = z.enum(customColourwayNames);

export const colourwayLabels = {
	classic: 'Classic',
	ocean: 'Ocean',
	violet: 'Violet',
	sunset: 'Sunset'
} as const satisfies Record<Colourway, string>;

export function setDocumentColourway(colourway: Colourway): void {
	document.documentElement.dataset.colourway = colourway;
}
