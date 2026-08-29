import type { LayoutServerLoad } from './$types';
import { defaultFormatPreferences } from '$lib/format-preferences';
import { defaultColourway } from '$lib/theme/colourway';

export const load: LayoutServerLoad = ({ locals }) => ({
	colourway: locals.user?.colourway ?? defaultColourway,
	formatPreferences: locals.user?.formatPreferences ?? defaultFormatPreferences
});
