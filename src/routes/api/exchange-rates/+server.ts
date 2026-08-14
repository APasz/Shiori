import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currencyConversionRatesRequestSchema } from '$lib/editing/contracts';
import type { CurrencyCode } from '$lib/itinerary/schema';
import { lookupCurrentEcbConversionRates } from '$lib/server/ecb-exchange-rates';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ message: 'Sign in to view exchange rates.' }, { status: 401 });
	}

	const request = currencyConversionRatesRequestSchema.safeParse({
		sourceCurrencies: url.searchParams.getAll('source'),
		targetCurrency: url.searchParams.get('target')
	});
	if (!request.success) {
		return json({ message: 'The requested currency conversion is invalid.' }, { status: 400 });
	}

	const conversion = await lookupCurrentEcbConversionRates({
		asOf: Date.now(),
		sourceCurrencies: request.data.sourceCurrencies,
		targetCurrency: request.data.targetCurrency
	});
	if (!conversion) {
		return json({ message: 'Current ECB exchange rates are unavailable. Try again shortly.' }, { status: 503 });
	}
	const rates: Array<{ sourceCurrency: CurrencyCode; targetCurrencyPerSourceCurrency: number }> = [];
	for (const sourceCurrency of request.data.sourceCurrencies) {
		const targetCurrencyPerSourceCurrency = conversion.targetCurrencyPerSourceCurrency.get(sourceCurrency);
		if (targetCurrencyPerSourceCurrency === undefined) {
			return json({ message: 'Current ECB exchange rates are incomplete. Try again shortly.' }, { status: 503 });
		}
		rates.push({ sourceCurrency, targetCurrencyPerSourceCurrency });
	}

	return json({
		effectiveDate: conversion.effectiveDate,
		rates,
		targetCurrency: request.data.targetCurrency
	});
};
