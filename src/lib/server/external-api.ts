export type ExpiringCachePolicy = Readonly<{
	maxEntries: number;
	timeToLiveMilliseconds: number;
}>;

type CacheEntry<Value> = Readonly<{
	expiresAt: number;
	value: Value;
}>;

/** A bounded, process-local LRU cache for successful external API responses. */
export class ExpiringCache<Value> {
	private readonly entries = new Map<string, CacheEntry<Value>>();

	public constructor(private readonly policy: ExpiringCachePolicy) {
		if (policy.maxEntries < 1 || !Number.isInteger(policy.maxEntries)) {
			throw new Error('External API cache maxEntries must be a positive integer.');
		}
		if (policy.timeToLiveMilliseconds < 1 || !Number.isSafeInteger(policy.timeToLiveMilliseconds)) {
			throw new Error('External API cache timeToLiveMilliseconds must be a positive safe integer.');
		}
	}

	public get(key: string): Value | undefined {
		const now = Date.now();
		this.removeExpired(now);
		const entry = this.entries.get(key);
		if (!entry) {
			return undefined;
		}

		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}

	public set(key: string, value: Value): void {
		const now = Date.now();
		this.removeExpired(now);
		this.entries.delete(key);
		this.entries.set(key, { expiresAt: now + this.policy.timeToLiveMilliseconds, value });
		while (this.entries.size > this.policy.maxEntries) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey === undefined) {
				return;
			}
			this.entries.delete(oldestKey);
		}
	}

	private removeExpired(now: number): void {
		for (const [key, entry] of this.entries) {
			if (entry.expiresAt <= now) {
				this.entries.delete(key);
			}
		}
	}
}

export type MonthlyRequestLimitPolicy = Readonly<{
	maximumRequests: number;
}>;

/** Limits billable provider calls for the current UTC calendar month within one server process. */
export class MonthlyRequestLimit {
	private month = '';
	private requests = 0;

	public constructor(private readonly policy: MonthlyRequestLimitPolicy) {
		if (policy.maximumRequests < 1 || !Number.isInteger(policy.maximumRequests)) {
			throw new Error('Monthly request limit must be a positive integer.');
		}
	}

	public tryAcquire(now = new Date()): boolean {
		const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
		if (currentMonth !== this.month) {
			this.month = currentMonth;
			this.requests = 0;
		}
		if (this.requests >= this.policy.maximumRequests) {
			return false;
		}
		this.requests += 1;
		return true;
	}
}

export type ProviderRequestPolicy = Readonly<{
	fallbackRetryDelayMilliseconds: number;
	maximumRateLimitRetries: number;
	minimumIntervalMilliseconds: number;
}>;

/** Signals that a provider rejected a request with HTTP 429. */
export class ProviderRateLimitError extends Error {
	public constructor(public readonly retryAfterMilliseconds: number | undefined) {
		super('External API request was rate limited.');
		this.name = 'ProviderRateLimitError';
	}
}

/** Coordinates one provider's requests, preventing duplicate work and request bursts. */
export class ProviderRequestCoordinator<Value> {
	private readonly inFlight = new Map<string, Promise<Value>>();
	private nextRequestAt = 0;
	private tail: Promise<void> = Promise.resolve();

	public constructor(private readonly policy: ProviderRequestPolicy) {
		if (policy.fallbackRetryDelayMilliseconds < 0 || !Number.isSafeInteger(policy.fallbackRetryDelayMilliseconds)) {
			throw new Error('External API fallbackRetryDelayMilliseconds must be a non-negative safe integer.');
		}
		if (policy.maximumRateLimitRetries < 0 || !Number.isInteger(policy.maximumRateLimitRetries)) {
			throw new Error('External API maximumRateLimitRetries must be a non-negative integer.');
		}
		if (policy.minimumIntervalMilliseconds < 0 || !Number.isSafeInteger(policy.minimumIntervalMilliseconds)) {
			throw new Error('External API minimumIntervalMilliseconds must be a non-negative safe integer.');
		}
	}

	public run(key: string, request: () => Promise<Value>): Promise<Value> {
		const existing = this.inFlight.get(key);
		if (existing) {
			return existing;
		}

		const operation = this.tail.then(() => this.runWithRetries(request));
		this.tail = operation.then(
			() => undefined,
			() => undefined
		);
		this.inFlight.set(key, operation);
		void operation.then(
			() => this.removeInFlight(key, operation),
			() => this.removeInFlight(key, operation)
		);
		return operation;
	}

	private async runWithRetries(request: () => Promise<Value>): Promise<Value> {
		let rateLimitRetries = 0;
		while (true) {
			await this.waitForRequestWindow();
			try {
				return await request();
			} catch (error: unknown) {
				if (!(error instanceof ProviderRateLimitError) || rateLimitRetries >= this.policy.maximumRateLimitRetries) {
					throw error;
				}

				rateLimitRetries += 1;
				const retryDelayMilliseconds = Math.max(
					error.retryAfterMilliseconds ?? 0,
					this.policy.fallbackRetryDelayMilliseconds
				);
				this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + retryDelayMilliseconds);
			}
		}
	}

	private async waitForRequestWindow(): Promise<void> {
		const waitMilliseconds = Math.max(0, this.nextRequestAt - Date.now());
		if (waitMilliseconds > 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, waitMilliseconds));
		}
		this.nextRequestAt = Date.now() + this.policy.minimumIntervalMilliseconds;
	}

	private removeInFlight(key: string, operation: Promise<Value>): void {
		if (this.inFlight.get(key) === operation) {
			this.inFlight.delete(key);
		}
	}
}

/** Throws a retryable error for a 429 response after releasing its response body. */
export async function throwIfRateLimited(response: Response): Promise<Response> {
	if (response.status !== 429) {
		return response;
	}

	await response.body?.cancel().catch(() => undefined);
	throw new ProviderRateLimitError(retryAfterMilliseconds(response.headers.get('retry-after')));
}

function retryAfterMilliseconds(value: string | null): number | undefined {
	if (!value) {
		return undefined;
	}

	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.ceil(seconds * 1_000);
	}

	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now());
}
