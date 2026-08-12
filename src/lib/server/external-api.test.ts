import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpiringCache, MonthlyRequestLimit, ProviderRateLimitError, ProviderRequestCoordinator } from './external-api';

afterEach(() => {
	vi.useRealTimers();
});

describe('ExpiringCache', () => {
	it('expires entries and evicts the least recently used entry at its capacity', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const cache = new ExpiringCache<string>({ maxEntries: 2, timeToLiveMilliseconds: 1_000 });

		cache.set('one', 'first');
		cache.set('two', 'second');
		expect(cache.get('one')).toBe('first');
		cache.set('three', 'third');

		expect(cache.get('one')).toBe('first');
		expect(cache.get('two')).toBeUndefined();
		expect(cache.get('three')).toBe('third');

		vi.advanceTimersByTime(1_000);
		expect(cache.get('one')).toBeUndefined();
		expect(cache.get('three')).toBeUndefined();
	});
});

describe('MonthlyRequestLimit', () => {
	it('resets request availability at the start of a UTC month', () => {
		const limit = new MonthlyRequestLimit({ maximumRequests: 2 });

		expect(limit.tryAcquire(new Date('2026-10-31T23:59:00.000Z'))).toBe(true);
		expect(limit.tryAcquire(new Date('2026-10-31T23:59:30.000Z'))).toBe(true);
		expect(limit.tryAcquire(new Date('2026-10-31T23:59:59.000Z'))).toBe(false);
		expect(limit.tryAcquire(new Date('2026-11-01T00:00:00.000Z'))).toBe(true);
	});
});

describe('ProviderRequestCoordinator', () => {
	it('coalesces concurrent requests with the same key', async () => {
		const coordinator = new ProviderRequestCoordinator<string>({
			fallbackRetryDelayMilliseconds: 0,
			maximumRateLimitRetries: 0,
			minimumIntervalMilliseconds: 0
		});
		const request = vi.fn(async () => 'result');

		const first = coordinator.run('flight:JQ14', request);
		const second = coordinator.run('flight:JQ14', request);

		expect(second).toBe(first);
		await expect(first).resolves.toBe('result');
		expect(request).toHaveBeenCalledOnce();
	});

	it('paces distinct requests by the configured minimum interval', async () => {
		vi.useFakeTimers();
		const coordinator = new ProviderRequestCoordinator<string>({
			fallbackRetryDelayMilliseconds: 0,
			maximumRateLimitRetries: 0,
			minimumIntervalMilliseconds: 1_000
		});
		const firstRequest = vi.fn(async () => 'first');
		const secondRequest = vi.fn(async () => 'second');

		const first = coordinator.run('first', firstRequest);
		const second = coordinator.run('second', secondRequest);

		await vi.advanceTimersByTimeAsync(0);
		expect(firstRequest).toHaveBeenCalledOnce();
		expect(secondRequest).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(999);
		expect(secondRequest).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);

		await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
		expect(secondRequest).toHaveBeenCalledOnce();
	});

	it('honours Retry-After before retrying a rate-limited request once', async () => {
		vi.useFakeTimers();
		const coordinator = new ProviderRequestCoordinator<string>({
			fallbackRetryDelayMilliseconds: 1_000,
			maximumRateLimitRetries: 1,
			minimumIntervalMilliseconds: 0
		});
		const request = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new ProviderRateLimitError(5_000))
			.mockResolvedValueOnce('retried');

		const result = coordinator.run('airport:PER', request);

		await vi.advanceTimersByTimeAsync(0);
		expect(request).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(4_999);
		expect(request).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1);

		await expect(result).resolves.toBe('retried');
		expect(request).toHaveBeenCalledTimes(2);
	});
});
