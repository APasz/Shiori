import { browser } from '$app/environment';
import { isValidIanaTimeZone } from './zoned-time';

function detectedTimeZone(): string {
	const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return isValidIanaTimeZone(resolved) ? resolved : 'UTC';
}

class ViewerContext {
	timeZone = $state('UTC');
	revision = $state(0);
	#overrideTimestamp = $state<number | null>(null);

	get currentTimestamp(): number {
		return this.#overrideTimestamp ?? Date.now();
	}

	get isSimulated(): boolean {
		return this.#overrideTimestamp !== null;
	}

	initialize(): void {
		if (browser && !this.isSimulated) {
			this.timeZone = detectedTimeZone();
		}
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
		this.timeZone = detectedTimeZone();
		this.revision += 1;
	}
}

export const viewerContext = new ViewerContext();
