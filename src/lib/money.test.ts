import { describe, expect, it } from 'vitest';
import { amountFromInput, formatMonetaryAmount } from './money';

describe('money values', () => {
	it('stores user-entered decimal amounts as exact minor units', () => {
		expect(amountFromInput('123.45', 'AUD')).toBe(12_345);
		expect(amountFromInput('500', 'JPY')).toBe(500);
		expect(amountFromInput('123.456', 'AUD')).toBeNull();
		expect(amountFromInput('-1', 'AUD')).toBeNull();
	});

	it('formats saved minor units with their currency code', () => {
		expect(formatMonetaryAmount(12_345, 'AUD', 'en-AU')).toContain('AUD');
	});
});
