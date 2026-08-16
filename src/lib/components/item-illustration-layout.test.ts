import { describe, expect, it } from 'vitest';
import { itemIllustrationHeight, itemIllustrationLayout } from './item-illustration-layout';

describe('item illustration layout', () => {
	it('keeps artwork aligned while its unused SVG canvas is the only constraint', () => {
		expect(itemIllustrationLayout(148.5)).toEqual({ overlapsTitle: false, width: 176 });
	});

	it('moves the artwork only when its painted area would approach the title', () => {
		expect(itemIllustrationLayout(100)).toEqual({ overlapsTitle: false, width: 152 });
	});

	it('flags an overlap only once the minimum artwork width cannot preserve the text gap', () => {
		expect(itemIllustrationLayout((66 + itemIllustrationHeight) / 2 - 0.5)).toEqual({
			overlapsTitle: true,
			width: 66
		});
	});
});
