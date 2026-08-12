import { type CurrencyCode } from '$lib/itinerary/schema';

const amountInputPattern = /^(?<whole>0|[1-9]\d*)(?:\.(?<fraction>\d+))?$/;

/** Returns the ISO 4217 fraction precision used when storing a currency in minor units. */
export function currencyFractionDigits(currency: CurrencyCode): number {
	return new Intl.NumberFormat('en', { currency, style: 'currency' }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Parses a user-entered decimal amount into an exact integer number of currency minor units. */
export function amountFromInput(value: string, currency: CurrencyCode): number | null {
	const match = amountInputPattern.exec(value.trim());
	if (!match?.groups) {
		return null;
	}

	const fractionDigits = currencyFractionDigits(currency);
	const fraction = match.groups.fraction ?? '';
	if (fraction.length > fractionDigits) {
		return null;
	}

	const minorValue =
		BigInt(match.groups.whole) * 10n ** BigInt(fractionDigits) + BigInt(fraction.padEnd(fractionDigits, '0'));
	return minorValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minorValue) : null;
}

/** Formats an exact minor-unit monetary amount for display in the viewer's locale. */
export function formatMonetaryAmount(amount: number, currency: CurrencyCode, locales?: string | string[]): string {
	const fractionDigits = currencyFractionDigits(currency);
	return new Intl.NumberFormat(locales, {
		currency,
		currencyDisplay: 'code',
		style: 'currency'
	}).format(amount / 10 ** fractionDigits);
}
