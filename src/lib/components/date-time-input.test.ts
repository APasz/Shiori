import { describe, expect, it } from 'vitest';
import { defaultDateForTimeOnlyValue } from './date-time-input';

describe('defaultDateForTimeOnlyValue', () => {
	it('uses the supplied date when a time is entered without a date', () => {
		expect(defaultDateForTimeOnlyValue('T18:30', '2026-11-01')).toBe('2026-11-01T18:30');
	});

	it('does not replace a date already chosen for the value', () => {
		expect(defaultDateForTimeOnlyValue('2026-11-02T18:30', '2026-11-01')).toBe('2026-11-02T18:30');
	});

	it('leaves incomplete values unchanged', () => {
		expect(defaultDateForTimeOnlyValue('T', '2026-11-01')).toBe('T');
		expect(defaultDateForTimeOnlyValue('T18:30', 'not-a-date')).toBe('T18:30');
	});
});
