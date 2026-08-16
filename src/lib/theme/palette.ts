import { z } from 'zod';
import type { ItineraryItemType, ReservationStatus } from '$lib/itinerary/schema';
import paletteSource from './palette.json';

const hexColorSchema = z.string().regex(/^#[\da-f]{6}$/i, 'Use a six-digit hexadecimal colour.');

const themeVariantSchema = z.strictObject({
	surface: z.strictObject({
		page: hexColorSchema,
		raised: hexColorSchema,
		subtle: hexColorSchema
	}),
	text: z.strictObject({
		primary: hexColorSchema,
		secondary: hexColorSchema,
		muted: hexColorSchema,
		'on-accent': hexColorSchema
	}),
	border: z.strictObject({
		default: hexColorSchema,
		strong: hexColorSchema,
		subtle: hexColorSchema
	}),
	icon: z.strictObject({
		'bookmark-outline': hexColorSchema,
		'bookmark-background': hexColorSchema,
		route: hexColorSchema
	}),
	itemType: z.strictObject({
		transport: hexColorSchema,
		accommodation: hexColorSchema,
		activity: hexColorSchema
	}),
	state: z.strictObject({
		success: hexColorSchema,
		warning: hexColorSchema,
		error: hexColorSchema,
		focus: hexColorSchema,
		selection: hexColorSchema
	}),
	overlay: z.strictObject({
		backdrop: hexColorSchema
	})
});

const themePaletteSchema = z.strictObject({
	light: themeVariantSchema,
	dark: themeVariantSchema,
	reservationStatus: z.strictObject({
		confirmed: z.enum(['success', 'warning', 'error']),
		pending: z.enum(['success', 'warning', 'error']),
		waitlisted: z.enum(['success', 'warning', 'error']),
		cancelled: z.enum(['success', 'warning', 'error'])
	})
});

export const themePalette = themePaletteSchema.parse(paletteSource);

function themeVariables(variant: z.infer<typeof themeVariantSchema>): string {
	const colorGroups = [
		['surface', variant.surface],
		['text', variant.text],
		['border', variant.border],
		['icon', variant.icon],
		['item-type', variant.itemType],
		['state', variant.state],
		['overlay', variant.overlay]
	] as const;

	return colorGroups
		.flatMap(([group, colors]) =>
			Object.entries(colors).map(([name, value]) => `\t--color-${group}-${name}: ${value};`)
		)
		.join('\n');
}

export const themeCss = `:root {
	color-scheme: dark;
${themeVariables(themePalette.dark)}
}

:root[data-theme='light'] {
	color-scheme: light;
${themeVariables(themePalette.light)}
}`;

export const themeStyleTag = `<style>${themeCss}</style>`;

export function itemTypeAccentStyle(itemType: ItineraryItemType): string {
	return `--item-accent: var(--color-item-type-${itemType});`;
}

export function reservationStatusStyle(status: ReservationStatus): string {
	const tone = themePalette.reservationStatus[status];
	return `--reservation-status: var(--color-state-${tone});`;
}
