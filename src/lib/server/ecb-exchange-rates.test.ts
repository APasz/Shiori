import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCurrentEcbConversionRates, lookupEcbConversionRate } from './ecb-exchange-rates';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ECB exchange rates', () => {
	it('uses the latest shared daily reference rate at or before payment', async () => {
		const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async () =>
				new Response(
					[
						'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
						'EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,2026-01-02,1.7508',
						'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.1721'
					].join('\n')
				)
		);
		vi.stubGlobal('fetch', fetchMock);

		const conversion = await lookupEcbConversionRate({
			chargedCurrency: 'USD',
			localCurrency: 'AUD',
			paidAt: Date.UTC(2026, 0, 3, 12)
		});

		expect(conversion).toEqual({
			effectiveDate: '2026-01-02',
			localCurrencyPerChargedCurrency: 1.7508 / 1.1721
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(requestUrl.pathname).toBe('/service/data/EXR/D.USD+AUD.EUR.SP00.A');
		expect(requestUrl.searchParams.get('endPeriod')).toBe('2026-01-03');
		expect(requestUrl.searchParams.get('startPeriod')).toBe('2025-12-24');
	});

	it('does not request the ECB for an identity conversion', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			lookupEcbConversionRate({
				chargedCurrency: 'EUR',
				localCurrency: 'EUR',
				paidAt: Date.UTC(2026, 0, 3, 12)
			})
		).resolves.toEqual({ effectiveDate: '2026-01-03', localCurrencyPerChargedCurrency: 1 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uses one shared current rate date when converting multiple source currencies', async () => {
		const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async () =>
				new Response(
					[
						'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
						'EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,2026-01-02,1.7508',
						'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.1721',
						'EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-01-01,183.21'
					].join('\n')
				)
		);
		vi.stubGlobal('fetch', fetchMock);

		const conversion = await lookupCurrentEcbConversionRates({
			asOf: Date.UTC(2026, 0, 3, 12),
			sourceCurrencies: ['AUD', 'USD'],
			targetCurrency: 'EUR'
		});

		expect(conversion?.effectiveDate).toBe('2026-01-02');
		expect(conversion?.targetCurrencyPerSourceCurrency).toEqual(
			new Map([
				['AUD', 1 / 1.7508],
				['USD', 1 / 1.1721]
			])
		);
		const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(requestUrl.pathname).toBe('/service/data/EXR/D.AUD+USD.EUR.SP00.A');
	});
});
