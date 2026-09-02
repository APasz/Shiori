import { describe, expect, it } from 'vitest';
import { defaultEndDateForTimingInput } from './timing-input';

describe('defaultEndDateForTimingInput', () => {
	it('uses the entered start date even when its time is incomplete', () => {
		expect(defaultEndDateForTimingInput('2026-11-01T', undefined, 'UTC')).toBe('2026-11-01');
	});

	it('uses a fallback schedule in the timing time zone when the start is empty', () => {
		expect(defaultEndDateForTimingInput('', Date.UTC(2026, 10, 1, 0, 30), 'America/Los_Angeles')).toBe('2026-10-31');
	});

	it('does not return an invalid or unavailable date', () => {
		expect(defaultEndDateForTimingInput('not-a-date', undefined, 'UTC')).toBeUndefined();
		expect(defaultEndDateForTimingInput('', Date.UTC(2026, 10, 1), 'not-a-zone')).toBeUndefined();
	});
});
