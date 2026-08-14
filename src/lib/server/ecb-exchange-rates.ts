import { calendarDateSchema, currencyCodeSchema, type CurrencyCode } from '$lib/itinerary/schema';
import { ExpiringCache, ProviderRateLimitError, ProviderRequestCoordinator, throwIfRateLimited } from './external-api';

const ecbDataEndpoint = 'https://data-api.ecb.europa.eu/service/data/EXR';
const cacheLifetimeMilliseconds = 24 * 60 * 60 * 1_000;
const currentRateCacheLifetimeMilliseconds = 60 * 60 * 1_000;
const cacheMaximumEntries = 2_000;
const lookupDaysBeforePayment = 10;
const requestTimeoutMilliseconds = 10_000;

export type EcbConversionRate = Readonly<{
	effectiveDate: string;
	localCurrencyPerChargedCurrency: number;
}>;

export type EcbCurrentConversionRates = Readonly<{
	effectiveDate: string;
	targetCurrencyPerSourceCurrency: ReadonlyMap<CurrencyCode, number>;
}>;

type EcbRateObservation = Readonly<{
	currency: CurrencyCode;
	effectiveDate: string;
	ratePerEuro: number;
}>;

const rateCache = new ExpiringCache<readonly EcbRateObservation[]>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: cacheLifetimeMilliseconds
});
const currentRateCache = new ExpiringCache<readonly EcbRateObservation[]>({
	maxEntries: cacheMaximumEntries,
	timeToLiveMilliseconds: currentRateCacheLifetimeMilliseconds
});
const providerRequests = new ProviderRequestCoordinator<readonly EcbRateObservation[]>({
	fallbackRetryDelayMilliseconds: 1_000,
	maximumRateLimitRetries: 1,
	minimumIntervalMilliseconds: 0
});

function calendarDateForTimestamp(timestamp: number): string | null {
	const instant = new Date(timestamp);
	if (Number.isNaN(instant.getTime())) {
		return null;
	}
	return instant.toISOString().slice(0, 10);
}

function calendarDateDaysEarlier(date: string, days: number): string {
	const instant = new Date(`${date}T00:00:00.000Z`);
	instant.setUTCDate(instant.getUTCDate() - days);
	return instant.toISOString().slice(0, 10);
}

function cacheKey(chargedCurrency: CurrencyCode, localCurrency: CurrencyCode, paidDate: string): string {
	return [chargedCurrency, localCurrency, paidDate].join(':');
}

function currentRatesCacheKey(
	sourceCurrencies: readonly CurrencyCode[],
	targetCurrency: CurrencyCode,
	asOfDate: string
): string {
	return ['current', targetCurrency, asOfDate, ...sourceCurrencies].join(':');
}

function csvRecords(source: string): readonly Record<string, string>[] | null {
	const [header, ...rows] = source.trim().split(/\r?\n/);
	if (!header) {
		return null;
	}
	const columns = header.split(',');
	const currencyIndex = columns.indexOf('CURRENCY');
	const dateIndex = columns.indexOf('TIME_PERIOD');
	const rateIndex = columns.indexOf('OBS_VALUE');
	if (currencyIndex < 0 || dateIndex < 0 || rateIndex < 0) {
		return null;
	}

	const records: Record<string, string>[] = [];
	for (const row of rows) {
		const cells = row.split(',');
		if (cells.length !== columns.length) {
			return null;
		}
		const record: Record<string, string> = {};
		for (const [index, column] of columns.entries()) {
			const cell = cells[index];
			if (column === undefined || cell === undefined) {
				return null;
			}
			record[column] = cell;
		}
		records.push(record);
	}
	return records;
}

function parseEcbObservations(source: string): readonly EcbRateObservation[] | null {
	const records = csvRecords(source);
	if (!records) {
		return null;
	}

	const observations: EcbRateObservation[] = [];
	for (const record of records) {
		const currency = currencyCodeSchema.safeParse(record.CURRENCY);
		const effectiveDate = calendarDateSchema.safeParse(record.TIME_PERIOD);
		const ratePerEuro = Number(record.OBS_VALUE);
		if (!currency.success || !effectiveDate.success || !Number.isFinite(ratePerEuro) || ratePerEuro <= 0) {
			return null;
		}
		observations.push({ currency: currency.data, effectiveDate: effectiveDate.data, ratePerEuro });
	}
	return observations;
}

function ratesForCurrencyPair(chargedCurrency: CurrencyCode, localCurrency: CurrencyCode): readonly CurrencyCode[] {
	return [...new Set([chargedCurrency, localCurrency].filter((currency) => currency !== 'EUR'))];
}

async function fetchEcbRates(
	currencies: readonly CurrencyCode[],
	startDate: string,
	endDate: string
): Promise<readonly EcbRateObservation[]> {
	if (currencies.length === 0) {
		return [];
	}

	const seriesKey = `D.${currencies.join('+')}.EUR.SP00.A`;
	const requestUrl = new URL(`${ecbDataEndpoint}/${seriesKey}`);
	requestUrl.searchParams.set('detail', 'dataonly');
	requestUrl.searchParams.set('endPeriod', endDate);
	requestUrl.searchParams.set('format', 'csvdata');
	requestUrl.searchParams.set('startPeriod', startDate);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		const response = await throwIfRateLimited(await fetch(requestUrl, { signal: controller.signal }));
		if (!response.ok) {
			throw new Error(`The ECB returned HTTP ${response.status}.`);
		}
		const observations = parseEcbObservations(await response.text());
		if (!observations) {
			throw new Error('The ECB returned an unrecognised exchange-rate response.');
		}
		return observations;
	} finally {
		clearTimeout(timeout);
	}
}

async function historicalRates(
	chargedCurrency: CurrencyCode,
	localCurrency: CurrencyCode,
	paidDate: string
): Promise<readonly EcbRateObservation[]> {
	const key = cacheKey(chargedCurrency, localCurrency, paidDate);
	const cached = rateCache.get(key);
	if (cached) {
		return cached;
	}

	const currencies = ratesForCurrencyPair(chargedCurrency, localCurrency);
	const startDate = calendarDateDaysEarlier(paidDate, lookupDaysBeforePayment);
	const observations = await providerRequests.run(key, () => fetchEcbRates(currencies, startDate, paidDate));
	rateCache.set(key, observations);
	return observations;
}

async function currentRates(
	sourceCurrencies: readonly CurrencyCode[],
	targetCurrency: CurrencyCode,
	asOfDate: string
): Promise<readonly EcbRateObservation[]> {
	const key = currentRatesCacheKey(sourceCurrencies, targetCurrency, asOfDate);
	const cached = currentRateCache.get(key);
	if (cached) {
		return cached;
	}

	const currencies = [...new Set([...sourceCurrencies, targetCurrency].filter((currency) => currency !== 'EUR'))];
	const startDate = calendarDateDaysEarlier(asOfDate, lookupDaysBeforePayment);
	const observations = await providerRequests.run(key, () => fetchEcbRates(currencies, startDate, asOfDate));
	currentRateCache.set(key, observations);
	return observations;
}

function rateForCurrencyOnDate(
	observations: readonly EcbRateObservation[],
	currency: CurrencyCode,
	date: string
): number | undefined {
	if (currency === 'EUR') {
		return 1;
	}
	return observations.find((observation) => observation.currency === currency && observation.effectiveDate === date)
		?.ratePerEuro;
}

/**
 * Returns the latest ECB reference rate available on or before a payment timestamp.
 * ECB rates are daily, so a weekend or bank holiday uses the preceding published business-day rate.
 */
export async function lookupEcbConversionRate(input: {
	chargedCurrency: CurrencyCode;
	localCurrency: CurrencyCode;
	paidAt: number;
}): Promise<EcbConversionRate | null> {
	if (input.chargedCurrency === input.localCurrency) {
		const effectiveDate = calendarDateForTimestamp(input.paidAt);
		return effectiveDate ? { effectiveDate, localCurrencyPerChargedCurrency: 1 } : null;
	}
	const paidDate = calendarDateForTimestamp(input.paidAt);
	if (!paidDate) {
		return null;
	}

	try {
		const observations = await historicalRates(input.chargedCurrency, input.localCurrency, paidDate);
		for (let offset = 0; offset <= lookupDaysBeforePayment; offset += 1) {
			const effectiveDate = calendarDateDaysEarlier(paidDate, offset);
			const chargedRatePerEuro = rateForCurrencyOnDate(observations, input.chargedCurrency, effectiveDate);
			const localRatePerEuro = rateForCurrencyOnDate(observations, input.localCurrency, effectiveDate);
			if (chargedRatePerEuro !== undefined && localRatePerEuro !== undefined) {
				return {
					effectiveDate,
					localCurrencyPerChargedCurrency: localRatePerEuro / chargedRatePerEuro
				};
			}
		}
		return null;
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('ECB exchange-rate lookup remained rate limited after retry.', { paidDate });
			return null;
		}
		console.warn('ECB exchange-rate lookup could not be completed.', {
			failure: error instanceof Error ? error.name : 'UnknownError',
			paidDate
		});
		return null;
	}
}

/**
 * Returns current ECB reference rates for several source currencies against one target currency.
 * All returned rates use the same latest shared business date.
 */
export async function lookupCurrentEcbConversionRates(input: {
	asOf: number;
	sourceCurrencies: readonly CurrencyCode[];
	targetCurrency: CurrencyCode;
}): Promise<EcbCurrentConversionRates | null> {
	const asOfDate = calendarDateForTimestamp(input.asOf);
	if (!asOfDate) {
		return null;
	}
	const sourceCurrencies = [...new Set(input.sourceCurrencies)].sort();
	if (sourceCurrencies.length === 0) {
		return null;
	}

	try {
		const observations = await currentRates(sourceCurrencies, input.targetCurrency, asOfDate);
		for (let offset = 0; offset <= lookupDaysBeforePayment; offset += 1) {
			const effectiveDate = calendarDateDaysEarlier(asOfDate, offset);
			const targetRatePerEuro = rateForCurrencyOnDate(observations, input.targetCurrency, effectiveDate);
			if (targetRatePerEuro === undefined) {
				continue;
			}

			const targetCurrencyPerSourceCurrency = new Map<CurrencyCode, number>();
			for (const sourceCurrency of sourceCurrencies) {
				const sourceRatePerEuro = rateForCurrencyOnDate(observations, sourceCurrency, effectiveDate);
				if (sourceRatePerEuro === undefined) {
					targetCurrencyPerSourceCurrency.clear();
					break;
				}
				targetCurrencyPerSourceCurrency.set(sourceCurrency, targetRatePerEuro / sourceRatePerEuro);
			}
			if (targetCurrencyPerSourceCurrency.size === sourceCurrencies.length) {
				return { effectiveDate, targetCurrencyPerSourceCurrency };
			}
		}
		return null;
	} catch (error: unknown) {
		if (error instanceof ProviderRateLimitError) {
			console.warn('Current ECB exchange-rate lookup remained rate limited after retry.', { asOfDate });
			return null;
		}
		console.warn('Current ECB exchange-rate lookup could not be completed.', {
			failure: error instanceof Error ? error.name : 'UnknownError',
			asOfDate
		});
		return null;
	}
}
