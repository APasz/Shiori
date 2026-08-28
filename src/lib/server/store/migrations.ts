import { z } from 'zod';
import {
	calendarDateSchema,
	currencyCodeSchema,
	minorUnitAmountSchema,
	tripDetailsSchema,
	unixTimestampSchema,
	type Expense
} from '$lib/itinerary/schema';
import {
	dailyExpenseStoredDataVersion,
	preAppearanceStoredDataVersion,
	freeformExpenseStoredDataVersion,
	legacyStoredDataVersion,
	preAccessBlockStoredDataVersion,
	preNotesStoredDataVersion,
	preSudoStoredDataVersion,
	previousStoredDataVersion,
	priorStoredDataVersion,
	migratableStoredUserSchema,
	storedDataVersion
} from './model';
import { defaultColourway } from '$lib/theme/colourway';

const legacyMonetaryAmountSchema = z.strictObject({
	amountMinor: minorUnitAmountSchema.min(1, 'Use an amount greater than zero.'),
	currency: currencyCodeSchema
});
const legacyConvertedMonetaryAmountSchema = z.strictObject({
	amountMinor: minorUnitAmountSchema,
	currency: currencyCodeSchema
});
const legacyCostSchema = z.discriminatedUnion('status', [
	z.strictObject({ amount: legacyMonetaryAmountSchema, status: z.literal('unpaid') }),
	z.strictObject({
		amount: legacyMonetaryAmountSchema,
		payment: z.strictObject({
			exchangeRate: z.number().finite().positive(),
			localAmount: legacyConvertedMonetaryAmountSchema,
			paidAt: unixTimestampSchema,
			rateDate: calendarDateSchema
		}),
		status: z.literal('paid')
	})
]);
const previousCostSchema = z.discriminatedUnion('status', [
	z.strictObject({ amount: minorUnitAmountSchema.min(1), currency: currencyCodeSchema, status: z.literal('unpaid') }),
	z.strictObject({
		amount: minorUnitAmountSchema.min(1),
		currency: currencyCodeSchema,
		payment: z.strictObject({
			exchangeRate: z.number().finite().positive(),
			localAmount: minorUnitAmountSchema,
			localCurrency: currencyCodeSchema,
			paidAt: unixTimestampSchema,
			rateDate: calendarDateSchema
		}),
		status: z.literal('paid')
	})
]);
const legacyDailyExpenseSchema = z.strictObject({
	date: calendarDateSchema,
	foodAmountMinor: minorUnitAmountSchema,
	miscAmountMinor: minorUnitAmountSchema
});
const migratableStoredTripFileEnvelopeSchema = z
	.object({
		version: z.union([
			z.literal(legacyStoredDataVersion),
			z.literal(previousStoredDataVersion),
			z.literal(priorStoredDataVersion),
			z.literal(dailyExpenseStoredDataVersion),
			z.literal(freeformExpenseStoredDataVersion),
			z.literal(preNotesStoredDataVersion),
			z.literal(preAccessBlockStoredDataVersion),
			z.literal(preSudoStoredDataVersion),
			z.literal(preAppearanceStoredDataVersion)
		]),
		trip: z
			.object({
				itinerary: z
					.object({
						items: z.array(z.unknown())
					})
					.passthrough()
			})
			.passthrough()
	})
	.passthrough();

type MigratableItinerary = Record<string, unknown> & { items: unknown[] };

const migratableStoredUsersFileSchema = z.strictObject({
	version: z.union([
		z.literal(legacyStoredDataVersion),
		z.literal(previousStoredDataVersion),
		z.literal(priorStoredDataVersion),
		z.literal(dailyExpenseStoredDataVersion),
		z.literal(freeformExpenseStoredDataVersion),
		z.literal(preNotesStoredDataVersion),
		z.literal(preAccessBlockStoredDataVersion),
		z.literal(preSudoStoredDataVersion),
		z.literal(preAppearanceStoredDataVersion)
	]),
	users: z.array(migratableStoredUserSchema)
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function earliestLegacyUserId(users: readonly { createdAt: number; id: string }[]): string | undefined {
	let earliestUser: (typeof users)[number] | undefined;
	for (const user of users) {
		if (
			!earliestUser ||
			user.createdAt < earliestUser.createdAt ||
			(user.createdAt === earliestUser.createdAt && user.id < earliestUser.id)
		) {
			earliestUser = user;
		}
	}
	return earliestUser?.id;
}

/** Adds the default colourway and assigns a sudo user to pre-sudo data. */
export function migrateStoredUsersFile(file: unknown): { file: unknown; migrationRequired: boolean } {
	const parsedFile = migratableStoredUsersFileSchema.safeParse(file);
	if (!parsedFile.success) {
		return { file, migrationRequired: false };
	}

	const firstUserId = earliestLegacyUserId(parsedFile.data.users);
	const preservesSudoRole = parsedFile.data.version === preAppearanceStoredDataVersion;
	return {
		file: {
			version: storedDataVersion,
			users: parsedFile.data.users.map((user) => ({
				...user,
				colourway: user.colourway ?? defaultColourway,
				isSudo: preservesSudoRole ? (user.isSudo ?? user.id === firstUserId) : user.id === firstUserId
			}))
		},
		migrationRequired: true
	};
}

function migrateLegacyCost(cost: unknown): unknown {
	const parsedCost = legacyCostSchema.safeParse(cost);
	if (!parsedCost.success) {
		return cost;
	}

	const migratedCost = {
		amountMinor: parsedCost.data.amount.amountMinor,
		currency: parsedCost.data.amount.currency,
		status: parsedCost.data.status
	};
	if (parsedCost.data.status === 'unpaid') {
		return migratedCost;
	}

	return {
		...migratedCost,
		payment: {
			exchangeRate: parsedCost.data.payment.exchangeRate,
			localAmountMinor: parsedCost.data.payment.localAmount.amountMinor,
			localCurrency: parsedCost.data.payment.localAmount.currency,
			paidAt: parsedCost.data.payment.paidAt,
			rateDate: parsedCost.data.payment.rateDate
		}
	};
}

function migratePreviousCost(cost: unknown): unknown {
	const parsedCost = previousCostSchema.safeParse(cost);
	if (!parsedCost.success) {
		return cost;
	}

	const migratedCost = {
		amountMinor: parsedCost.data.amount,
		currency: parsedCost.data.currency,
		status: parsedCost.data.status
	};
	if (parsedCost.data.status === 'unpaid') {
		return migratedCost;
	}

	return {
		...migratedCost,
		payment: {
			exchangeRate: parsedCost.data.payment.exchangeRate,
			localAmountMinor: parsedCost.data.payment.localAmount,
			localCurrency: parsedCost.data.payment.localCurrency,
			paidAt: parsedCost.data.payment.paidAt,
			rateDate: parsedCost.data.payment.rateDate
		}
	};
}

function migrateLegacyDailyExpenses(itinerary: MigratableItinerary): MigratableItinerary {
	const parsedCurrency = tripDetailsSchema.shape.localCurrency.safeParse(itinerary.localCurrency);
	const parsedDailyExpenses = z.array(legacyDailyExpenseSchema).safeParse(itinerary.dailyExpenses);
	if (!parsedCurrency.success || !parsedDailyExpenses.success) {
		return itinerary;
	}

	const itineraryWithoutDailyExpenses = { ...itinerary };
	delete itineraryWithoutDailyExpenses.dailyExpenses;
	const expenses: Expense[] = parsedDailyExpenses.data.flatMap((dailyExpense) => {
		const expensesForDay: Expense[] = [];
		if (dailyExpense.foodAmountMinor > 0) {
			expensesForDay.push({
				amountMinor: dailyExpense.foodAmountMinor,
				availableForItemCosts: false,
				category: 'food',
				currency: parsedCurrency.data,
				id: `food-${dailyExpense.date}`,
				paidDate: dailyExpense.date,
				status: 'paid',
				title: 'Food',
				useDate: dailyExpense.date
			});
		}
		if (dailyExpense.miscAmountMinor > 0) {
			expensesForDay.push({
				amountMinor: dailyExpense.miscAmountMinor,
				availableForItemCosts: false,
				category: 'misc',
				currency: parsedCurrency.data,
				id: `misc-${dailyExpense.date}`,
				paidDate: dailyExpense.date,
				status: 'paid',
				title: 'Miscellaneous',
				useDate: dailyExpense.date
			});
		}
		return expensesForDay;
	});
	return { ...itineraryWithoutDailyExpenses, expenses };
}

export function migrateStoredTripFile(file: unknown): { file: unknown; migrationRequired: boolean } {
	const parsedFile = migratableStoredTripFileEnvelopeSchema.safeParse(file);
	if (!parsedFile.success) {
		return { file, migrationRequired: false };
	}

	const migrateCost =
		parsedFile.data.version === legacyStoredDataVersion
			? migrateLegacyCost
			: parsedFile.data.version === previousStoredDataVersion
				? migratePreviousCost
				: (cost: unknown) => cost;
	const sourceItinerary = parsedFile.data.trip.itinerary as MigratableItinerary;
	const itinerary =
		parsedFile.data.version === dailyExpenseStoredDataVersion
			? migrateLegacyDailyExpenses(sourceItinerary)
			: sourceItinerary;
	return {
		file: {
			...parsedFile.data,
			version: storedDataVersion,
			trip: {
				...parsedFile.data.trip,
				itinerary: {
					...itinerary,
					items: itinerary.items.map((item) => {
						if (!isRecord(item) || !Object.hasOwn(item, 'cost')) {
							return item;
						}
						return { ...item, cost: migrateCost(item.cost) };
					})
				}
			}
		},
		migrationRequired: true
	};
}
