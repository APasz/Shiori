import { convertAmountMinor } from '$lib/money';
import {
	itineraryItemSchema,
	type Cost,
	type CostAmount,
	type CurrencyCode,
	type ItineraryItem,
	type ItineraryItemDraft
} from '$lib/itinerary/schema';
import { lookupEcbConversionRate } from '../ecb-exchange-rates';
import { StoreError } from './error';
import { timestamp } from './time';

function sameCostAmount(left: CostAmount, right: CostAmount): boolean {
	return left.amountMinor === right.amountMinor && left.currency === right.currency;
}

function convertedCostAmountMinor(amount: CostAmount, localCurrency: CurrencyCode, exchangeRate: number): number {
	const converted = convertAmountMinor(amount.amountMinor, amount.currency, localCurrency, exchangeRate);
	if (converted === null || converted > 1_000_000_000_000) {
		throw new StoreError(400, 'The converted cost is outside Shiori’s supported range.');
	}
	return converted;
}

export async function persistedItemForCost(
	item: ItineraryItemDraft,
	localCurrency: CurrencyCode,
	existingItem: ItineraryItem | undefined
): Promise<ItineraryItem> {
	const cost = item.cost;
	if (!cost || cost.status === 'unpaid') {
		return itineraryItemSchema.parse(item);
	}

	if (existingItem?.cost?.status === 'paid') {
		if (!sameCostAmount(cost, existingItem.cost)) {
			throw new StoreError(400, 'Set this cost to unpaid and save before changing its charged amount or currency.');
		}
		const updatedCost: Cost = {
			amountMinor: existingItem.cost.amountMinor,
			currency: existingItem.cost.currency,
			payment: existingItem.cost.payment,
			...(cost.scheduledPaymentDate ? { scheduledPaymentDate: cost.scheduledPaymentDate } : {}),
			status: 'paid'
		};
		return itineraryItemSchema.parse({ ...item, cost: updatedCost });
	}

	const paidAt = timestamp();
	const exchangeRate = await lookupEcbConversionRate({
		chargedCurrency: cost.currency,
		localCurrency,
		paidAt
	});
	if (!exchangeRate) {
		throw new StoreError(
			503,
			'The ECB reference rate is unavailable. Leave this cost unpaid and try marking it paid again shortly.'
		);
	}

	const paidCost: Cost = {
		amountMinor: cost.amountMinor,
		currency: cost.currency,
		...(cost.scheduledPaymentDate ? { scheduledPaymentDate: cost.scheduledPaymentDate } : {}),
		payment: {
			exchangeRate: exchangeRate.localCurrencyPerChargedCurrency,
			rateDate: exchangeRate.effectiveDate,
			localAmountMinor: convertedCostAmountMinor(cost, localCurrency, exchangeRate.localCurrencyPerChargedCurrency),
			localCurrency,
			paidAt
		},
		status: 'paid'
	};
	return itineraryItemSchema.parse({ ...item, cost: paidCost });
}
