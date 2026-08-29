import { browser } from '$app/environment';
import { page } from '$app/state';
import { defaultFormatPreferences, type FormatPreferences } from '$lib/format-preferences';
import { isValidIanaTimeZone } from './zoned-time';

function detectedTimeZone(): string {
	const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return isValidIanaTimeZone(resolved) ? resolved : 'UTC';
}

function detectedLocale(): string | null {
	try {
		const locale = Intl.DateTimeFormat().resolvedOptions().locale;
		return locale && locale !== 'und' ? locale : null;
	} catch {
		return null;
	}
}

function persistedFormatPreferences(): FormatPreferences {
	try {
		return page.data.formatPreferences ?? defaultFormatPreferences;
	} catch {
		// Isolated component rendering has no request-bound page data.
		return defaultFormatPreferences;
	}
}

class ViewerContext {
	locale = $state<string | null>(null);
	timeZone = $state('UTC');
	revision = $state(0);
	#formatPreferences = $state<FormatPreferences | null>(null);
	#overrideTimestamp = $state<number | null>(null);

	get formatPreferences(): FormatPreferences {
		return this.#formatPreferences ?? persistedFormatPreferences();
	}

	get currentTimestamp(): number {
		return this.#overrideTimestamp ?? Date.now();
	}

	get isSimulated(): boolean {
		return this.#overrideTimestamp !== null;
	}

	initialize(formatPreferences: FormatPreferences = defaultFormatPreferences): void {
		this.setFormatPreferences(formatPreferences);
		if (!browser) {
			return;
		}
		this.locale = detectedLocale();
		if (!this.isSimulated) {
			this.timeZone = detectedTimeZone();
		}
	}

	setFormatPreferences(formatPreferences: FormatPreferences): void {
		this.#formatPreferences = formatPreferences;
	}

	setSimulated(timestamp: number, timeZone: string): void {
		if (!Number.isSafeInteger(timestamp)) {
			throw new Error('The simulated time must be a valid Unix-millisecond timestamp.');
		}
		if (!isValidIanaTimeZone(timeZone)) {
			throw new Error(`The simulated time zone ${timeZone} is not valid.`);
		}
		this.timeZone = timeZone;
		this.#overrideTimestamp = timestamp;
		this.revision += 1;
	}

	resetToBrowser(): void {
		this.#overrideTimestamp = null;
		this.locale = detectedLocale();
		this.timeZone = detectedTimeZone();
		this.revision += 1;
	}
}

export const viewerContext = new ViewerContext();
