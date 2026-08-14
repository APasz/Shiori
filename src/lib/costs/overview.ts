import type { CurrencyCode, ExpenseCategory, Itinerary } from '$lib/itinerary/schema';

export const expenseCategoryKeys = [
	'transport',
	'accommodation',
	'activity',
	'food',
	'misc',
	'other'
] as const satisfies readonly ExpenseCategory[];

export type ExpenseCategoryKey = (typeof expenseCategoryKeys)[number];

export type CurrencyTotal = Readonly<{
	amountMinor: number;
	currency: CurrencyCode;
}>;

export type ExpenseCategorySummary = Readonly<{
	category: ExpenseCategoryKey;
	label: string;
	paid: readonly CurrencyTotal[];
	unpaid: readonly CurrencyTotal[];
}>;

export type ExpenseOverview = Readonly<{
	categories: readonly ExpenseCategorySummary[];
	paid: readonly CurrencyTotal[];
	unpaid: readonly CurrencyTotal[];
}>;

export const expenseCategoryLabels: Readonly<Record<ExpenseCategory, string>> = {
	transport: 'Transport',
	accommodation: 'Accommodation',
	activity: 'Activities',
	food: 'Food',
	misc: 'Miscellaneous',
	other: 'Other'
};

type MutableExpenseCategorySummary = {
	paid: Map<CurrencyCode, number>;
	unpaid: Map<CurrencyCode, number>;
};

function addAmount(amounts: Map<CurrencyCode, number>, currency: CurrencyCode, amountMinor: number): void {
	amounts.set(currency, (amounts.get(currency) ?? 0) + amountMinor);
}

function currencyTotals(amounts: Map<CurrencyCode, number>): CurrencyTotal[] {
	return [...amounts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([currency, amountMinor]) => ({ amountMinor, currency }));
}

function emptyCategorySummary(): MutableExpenseCategorySummary {
	return { paid: new Map(), unpaid: new Map() };
}

/** Summarizes itinerary item costs and free-form expenses without mixing monetary currencies. */
export function summarizeExpenses(itinerary: Itinerary): ExpenseOverview {
	const summaries = new Map<ExpenseCategoryKey, MutableExpenseCategorySummary>(
		expenseCategoryKeys.map((category) => [category, emptyCategorySummary()])
	);
	const paid = new Map<CurrencyCode, number>();
	const unpaid = new Map<CurrencyCode, number>();

	for (const item of itinerary.items) {
		if (!item.cost) {
			continue;
		}

		const summary = summaries.get(item.type);
		if (!summary) {
			throw new Error(`Unsupported itinerary expense category: ${item.type}.`);
		}
		if (item.cost.status === 'paid') {
			addAmount(summary.paid, item.cost.payment.localCurrency, item.cost.payment.localAmountMinor);
			addAmount(paid, item.cost.payment.localCurrency, item.cost.payment.localAmountMinor);
		} else {
			addAmount(summary.unpaid, item.cost.currency, item.cost.amountMinor);
			addAmount(unpaid, item.cost.currency, item.cost.amountMinor);
		}
	}

	for (const expense of itinerary.expenses) {
		const summary = summaries.get(expense.category);
		if (!summary) {
			throw new Error(`Unsupported expense category: ${expense.category}.`);
		}
		if (expense.status === 'paid') {
			addAmount(summary.paid, expense.currency, expense.amountMinor);
			addAmount(paid, expense.currency, expense.amountMinor);
		} else {
			addAmount(summary.unpaid, expense.currency, expense.amountMinor);
			addAmount(unpaid, expense.currency, expense.amountMinor);
		}
	}

	return {
		categories: expenseCategoryKeys.map((category) => {
			const summary = summaries.get(category);
			if (!summary) {
				throw new Error(`Missing expense category summary: ${category}.`);
			}
			return {
				category,
				label: expenseCategoryLabels[category],
				paid: currencyTotals(summary.paid),
				unpaid: currencyTotals(summary.unpaid)
			};
		}),
		paid: currencyTotals(paid),
		unpaid: currencyTotals(unpaid)
	};
}
