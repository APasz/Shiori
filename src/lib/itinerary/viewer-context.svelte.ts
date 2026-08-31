import { browser } from '$app/environment';
import { page } from '$app/state';
import { defaultFormatPreferences, type FormatPreferences } from '$lib/format-preferences';
import { isOnOrAfterUnixEpoch } from './unix-time';
import { isValidIanaTimeZone } from './zoned-time';

export const viewerTimeZoneStorageKey = 'shiori:viewer-time-zone';

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

function persistedTimeZoneOverride(): string | null {
	try {
		const stored = localStorage.getItem(viewerTimeZoneStorageKey);
		return stored !== null && isValidIanaTimeZone(stored) ? stored : null;
	} catch {
		return null;
	}
}

function persistTimeZoneOverride(timeZone: string | null): void {
	try {
		if (timeZone === null) {
			localStorage.removeItem(viewerTimeZoneStorageKey);
			return;
		}
		localStorage.setItem(viewerTimeZoneStorageKey, timeZone);
	} catch {
		// The override remains active for this page when browser storage is unavailable.
	}
}

export class ViewerContext {
	constructor(private readonly detectBrowserTimeZone: () => string = detectedTimeZone) {}

	browserTimeZone = $state('UTC');
	locale = $state<string | null>(null);
	timeZone = $state('UTC');
	revision = $state(0);
	#formatPreferences = $state<FormatPreferences | null>(null);
	#overrideTimestamp = $state<number | null>(null);
	#timeZoneOverride = $state<string | null>(null);

	get formatPreferences(): FormatPreferences {
		return this.#formatPreferences ?? persistedFormatPreferences();
	}

	get currentTimestamp(): number {
		return this.#overrideTimestamp ?? Date.now();
	}

	get isSimulated(): boolean {
		return this.#overrideTimestamp !== null;
	}

	get isTimeZoneOverridden(): boolean {
		return this.#timeZoneOverride !== null;
	}

	initialize(formatPreferences: FormatPreferences = defaultFormatPreferences): void {
		this.setFormatPreferences(formatPreferences);
		if (!browser) {
			return;
		}
		this.locale = detectedLocale();
		this.updateBrowserTimeZone();
		const timeZoneOverride = persistedTimeZoneOverride();
		if (timeZoneOverride) {
			this.setTimeZoneOverride(timeZoneOverride);
		}
	}

	setFormatPreferences(formatPreferences: FormatPreferences): void {
		this.#formatPreferences = formatPreferences;
	}

	setSimulated(timestamp: number): void {
		if (!Number.isSafeInteger(timestamp) || !isOnOrAfterUnixEpoch(timestamp)) {
			throw new Error('The simulated time must be a Unix-millisecond timestamp no earlier than the Unix epoch.');
		}
		this.#overrideTimestamp = timestamp;
		this.revision += 1;
	}

	/** Sets the local zone used to present itinerary times without changing saved timestamps. */
	setTimeZoneOverride(timeZone: string): void {
		if (!isValidIanaTimeZone(timeZone)) {
			throw new Error(`The time zone ${timeZone} is not valid.`);
		}
		if (timeZone === this.browserTimeZone) {
			const hasChanged = this.#timeZoneOverride !== null || this.timeZone !== timeZone;
			this.#timeZoneOverride = null;
			this.timeZone = timeZone;
			persistTimeZoneOverride(null);
			if (hasChanged) {
				this.revision += 1;
			}
			return;
		}
		if (this.#timeZoneOverride === timeZone && this.timeZone === timeZone) {
			return;
		}

		this.#timeZoneOverride = timeZone;
		this.timeZone = timeZone;
		persistTimeZoneOverride(timeZone);
		this.revision += 1;
	}

	/** Resumes following the time zone reported by the browser. */
	clearTimeZoneOverride(): void {
		if (this.#timeZoneOverride === null) {
			return;
		}

		this.#timeZoneOverride = null;
		persistTimeZoneOverride(null);
		this.timeZone = this.browserTimeZone;
		this.revision += 1;
	}

	/** Updates the viewer zone when the browser reports that it has changed. */
	redetectBrowserTimeZone(): void {
		if (this.updateBrowserTimeZone()) {
			this.revision += 1;
		}
	}

	resetToBrowser(): void {
		this.#overrideTimestamp = null;
		this.#timeZoneOverride = null;
		persistTimeZoneOverride(null);
		this.locale = detectedLocale();
		this.updateBrowserTimeZone();
		this.revision += 1;
	}

	private updateBrowserTimeZone(): boolean {
		this.browserTimeZone = this.detectBrowserTimeZone();
		if (this.isSimulated || this.isTimeZoneOverridden || this.timeZone === this.browserTimeZone) {
			return false;
		}
		this.timeZone = this.browserTimeZone;
		return true;
	}
}

export const viewerContext = new ViewerContext();
