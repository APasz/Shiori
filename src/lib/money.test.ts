import { describe, expect, it } from 'vitest';
import { amountMinorFromInput, formatMonetaryAmount } from './money';

describe('money values', () => {
	it('stores user-entered decimal amounts as exact minor units', () => {
		expect(amountMinorFromInput('123.45', 'AUD')).toBe(12_345);
		expect(amountMinorFromInput('500', 'JPY')).toBe(500);
		expect(amountMinorFromInput('123.456', 'AUD')).toBeNull();
		expect(amountMinorFromInput('-1', 'AUD')).toBeNull();
	});

	it('formats saved minor units with their currency code', () => {
		expect(formatMonetaryAmount(12_345, 'AUD', 'en-AU')).toContain('AUD');
	});
});
