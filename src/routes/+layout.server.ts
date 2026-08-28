import type { LayoutServerLoad } from './$types';
import { defaultColourway } from '$lib/theme/colourway';

export const load: LayoutServerLoad = ({ locals }) => ({
	colourway: locals.user?.colourway ?? defaultColourway
});
