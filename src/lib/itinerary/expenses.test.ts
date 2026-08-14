import { describe, expect, it } from 'vitest';
import { expenseSchema } from './schema';
import { resolveLinkedExpenses } from './expenses';

describe('linked expenses', () => {
	it('preserves link order and ignores missing expense IDs', () => {
		const food = expenseSchema.parse({
			amountMinor: 1_250,
			category: 'food',
			currency: 'AUD',
			id: 'food',
			status: 'unpaid',
			title: 'Food'
		});
		const railPass = expenseSchema.parse({
			amountMinor: 45_000,
			category: 'transport',
			currency: 'AUD',
			id: 'rail-pass',
			status: 'unpaid',
			title: 'Rail pass'
		});

		expect(resolveLinkedExpenses([food, railPass], ['rail-pass', 'missing-expense', 'food'])).toEqual([railPass, food]);
	});
});
