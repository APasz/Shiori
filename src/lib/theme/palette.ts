import { z } from 'zod';
import type { ItineraryItemType, ReservationStatus } from '$lib/itinerary/schema';
import {
	colourwayLabels,
	colourwayNames,
	customColourwaySchema,
	defaultColourway,
	type Colourway
} from './colourway.ts';
import paletteSource from './palette.json' with { type: 'json' };

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

const colourwayVariantSchema = z.strictObject({
	icon: z.strictObject({
		route: hexColorSchema
	}),
	itemType: z.strictObject({
		transport: hexColorSchema,
		accommodation: hexColorSchema,
		activity: hexColorSchema
	}),
	state: z.strictObject({
		focus: hexColorSchema,
		selection: hexColorSchema
	})
});

const themePaletteSchema = z.strictObject({
	light: themeVariantSchema,
	dark: themeVariantSchema,
	colourways: z.record(
		customColourwaySchema,
		z.strictObject({
			light: colourwayVariantSchema,
			dark: colourwayVariantSchema
		})
	),
	reservationStatus: z.strictObject({
		confirmed: z.enum(['success', 'warning', 'error']),
		pending: z.enum(['success', 'warning', 'error']),
		waitlisted: z.enum(['success', 'warning', 'error']),
		cancelled: z.enum(['success', 'warning', 'error'])
	})
});

export const themePalette = themePaletteSchema.parse(paletteSource);

type ThemeVariant = z.infer<typeof themeVariantSchema>;
type ColourwayVariant = z.infer<typeof colourwayVariantSchema>;

function themeVariables(variant: ThemeVariant): string {
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

function colourwayVariables(variant: ColourwayVariant): string {
	const colorGroups = [
		['icon', variant.icon],
		['item-type', variant.itemType],
		['state', variant.state]
	] as const;

	return colorGroups
		.flatMap(([group, colors]) =>
			Object.entries(colors).map(([name, value]) => `\t--color-${group}-${name}: ${value};`)
		)
		.join('\n');
}

function defaultColourwayVariant(variant: ThemeVariant): ColourwayVariant {
	return {
		icon: { route: variant.icon.route },
		itemType: variant.itemType,
		state: {
			focus: variant.state.focus,
			selection: variant.state.selection
		}
	};
}

function colourwayVariant(colourway: Colourway, theme: 'dark' | 'light'): ColourwayVariant {
	return colourway === defaultColourway
		? defaultColourwayVariant(themePalette[theme])
		: themePalette.colourways[colourway][theme];
}

function colourwayCss(colourway: Colourway): string {
	const selector = `[data-colourway='${colourway}']`;
	return `${selector} {
${colourwayVariables(colourwayVariant(colourway, 'dark'))}
}

:root[data-theme='light']${selector},
:root[data-theme='light'] ${selector} {
${colourwayVariables(colourwayVariant(colourway, 'light'))}
}`;
}

export const colourwayOptions = colourwayNames.map((name) => ({
	label: colourwayLabels[name],
	name,
	swatch: colourwayVariant(name, 'light').state.selection
}));

export const themeCss = `:root {
	color-scheme: dark;
${themeVariables(themePalette.dark)}
}

:root[data-theme='light'] {
	color-scheme: light;
${themeVariables(themePalette.light)}
}

${colourwayNames.map(colourwayCss).join('\n\n')}`;

export const themeStyleTag = `<style>${themeCss}</style>`;

export function itemTypeAccentStyle(itemType: ItineraryItemType): string {
	return `--item-accent: var(--color-item-type-${itemType});`;
}

export function reservationStatusStyle(status: ReservationStatus): string {
	const tone = themePalette.reservationStatus[status];
	return `--reservation-status: var(--color-state-${tone});`;
}
