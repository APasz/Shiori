import { describe, expect, it } from 'vitest';
import { LoginRateLimiter, type LoginRateLimitPolicy } from './login-rate-limit';

const testPolicy: LoginRateLimitPolicy = {
	blockWindowMilliseconds: 1_000,
	initialBlockMilliseconds: 100,
	maximumBlockMilliseconds: 400,
	maximumFailures: 3,
	maximumTrackedKeys: 10,
	windowMilliseconds: 1_000
};

describe('LoginRateLimiter', () => {
	it('blocks repeated failures by both username and client address', () => {
		let currentTime = 0;
		const limiter = new LoginRateLimiter(testPolicy, () => currentTime);
		const attempt = { clientAddress: '203.0.113.8', username: 'shiori' };

		limiter.recordFailure(attempt);
		limiter.recordFailure(attempt);
		expect(limiter.check(attempt)).toEqual({ allowed: true });

		limiter.recordFailure(attempt);
		expect(limiter.check(attempt)).toEqual({ allowed: false, retryAfterSeconds: 1 });
		expect(limiter.check({ ...attempt, username: 'another-account' })).toEqual({
			allowed: false,
			retryAfterSeconds: 1
		});

		currentTime += 100;
		expect(limiter.check(attempt)).toEqual({ allowed: true });
	});

	it('clears the relevant records after a successful sign-in', () => {
		const limiter = new LoginRateLimiter(testPolicy, () => 0);
		const attempt = { clientAddress: '2001:db8::1', username: 'Shiori' };

		for (let failure = 0; failure < testPolicy.maximumFailures; failure += 1) {
			limiter.recordFailure(attempt);
		}
		expect(limiter.check(attempt).allowed).toBe(false);

		limiter.clear(attempt);
		expect(limiter.check(attempt)).toEqual({ allowed: true });
	});
});
