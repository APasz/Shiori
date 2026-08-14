import type { Expense } from './schema';

/** Resolves an item's linked expenses in link order, ignoring references that are no longer available. */
export function resolveLinkedExpenses(expenses: readonly Expense[], linkedExpenseIds: readonly string[]): Expense[] {
	const expensesById = new Map(expenses.map((expense) => [expense.id, expense]));
	return linkedExpenseIds.flatMap((expenseId) => {
		const expense = expensesById.get(expenseId);
		return expense ? [expense] : [];
	});
}
