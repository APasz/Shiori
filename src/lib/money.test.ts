import { describe, expect, it } from 'vitest';
import { amountMinorFromInput, convertAmountMinor, formatMonetaryAmount } from './money';

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

	it('converts between source and target minor units at a whole-currency rate', () => {
		expect(convertAmountMinor(12_345, 'AUD', 'USD', 0.65)).toBe(8_024);
		expect(convertAmountMinor(500, 'JPY', 'AUD', 0.01)).toBe(500);
	});
});
