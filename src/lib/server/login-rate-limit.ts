import { usernameIdentityKey, usernameSchema } from './store/model';

export type LoginRateLimitPolicy = Readonly<{
	blockWindowMilliseconds: number;
	initialBlockMilliseconds: number;
	maximumBlockMilliseconds: number;
	maximumFailures: number;
	maximumTrackedKeys: number;
	windowMilliseconds: number;
}>;

export type LoginAttempt = Readonly<{
	clientAddress: string;
	username: string;
}>;

export type LoginAttemptAllowance =
	Readonly<{ allowed: true }> | Readonly<{ allowed: false; retryAfterSeconds: number }>;

type FailedLoginRecord = {
	blockedUntil: number;
	failures: number;
	windowStartedAt: number;
};

export const loginRateLimitPolicy: LoginRateLimitPolicy = {
	blockWindowMilliseconds: 15 * 60 * 1000,
	initialBlockMilliseconds: 30 * 1000,
	maximumBlockMilliseconds: 15 * 60 * 1000,
	maximumFailures: 5,
	maximumTrackedKeys: 10_000,
	windowMilliseconds: 15 * 60 * 1000
};

const invalidUsernameRateLimitKey = 'invalid';

function identifierKeys(attempt: LoginAttempt): readonly [string, string] {
	const address = attempt.clientAddress.trim() || 'unknown';
	const parsedUsername = usernameSchema.safeParse(attempt.username);
	const username = parsedUsername.success ? usernameIdentityKey(parsedUsername.data) : invalidUsernameRateLimitKey;
	return [`address:${address}`, `username:${username}`];
}

export class LoginRateLimiter {
	readonly #records = new Map<string, FailedLoginRecord>();

	constructor(
		private readonly policy: LoginRateLimitPolicy,
		private readonly now: () => number = Date.now
	) {}

	check(attempt: LoginAttempt): LoginAttemptAllowance {
		const currentTime = this.now();
		this.prune(currentTime);
		const blockedUntil = Math.max(...identifierKeys(attempt).map((key) => this.#records.get(key)?.blockedUntil ?? 0));

		if (blockedUntil <= currentTime) {
			return { allowed: true };
		}

		return {
			allowed: false,
			retryAfterSeconds: Math.ceil((blockedUntil - currentTime) / 1000)
		};
	}

	recordFailure(attempt: LoginAttempt): void {
		const currentTime = this.now();
		this.prune(currentTime);

		for (const key of identifierKeys(attempt)) {
			const record = this.recordFor(key, currentTime);
			record.failures += 1;

			if (record.failures >= this.policy.maximumFailures) {
				const penaltyPower = record.failures - this.policy.maximumFailures;
				const delay = Math.min(
					this.policy.initialBlockMilliseconds * 2 ** penaltyPower,
					this.policy.maximumBlockMilliseconds
				);
				record.blockedUntil = currentTime + delay;
			}
		}
	}

	clear(attempt: LoginAttempt): void {
		for (const key of identifierKeys(attempt)) {
			this.#records.delete(key);
		}
	}

	private recordFor(key: string, currentTime: number): FailedLoginRecord {
		const existing = this.#records.get(key);
		if (existing && currentTime - existing.windowStartedAt <= this.policy.windowMilliseconds) {
			return existing;
		}

		while (this.#records.size >= this.policy.maximumTrackedKeys) {
			const oldestKey = this.#records.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this.#records.delete(oldestKey);
		}

		const record: FailedLoginRecord = {
			blockedUntil: 0,
			failures: 0,
			windowStartedAt: currentTime
		};
		this.#records.set(key, record);
		return record;
	}

	private prune(currentTime: number): void {
		for (const [key, record] of this.#records) {
			if (
				record.blockedUntil <= currentTime &&
				currentTime - record.windowStartedAt > this.policy.blockWindowMilliseconds
			) {
				this.#records.delete(key);
			}
		}
	}
}

export const loginRateLimiter = new LoginRateLimiter(loginRateLimitPolicy);
