import { describe, expect, it } from 'vitest';
import { formatTime } from './format-preferences';

describe('display format preferences', () => {
	it('formats canonical times in 12-hour and 24-hour forms', () => {
		expect(formatTime('00:05', 'twelve-hour')).toBe('12:05 am');
		expect(formatTime('12:30', 'twelve-hour')).toBe('12:30 pm');
		expect(formatTime('14:30', 'twelve-hour')).toBe('2:30 pm');
		expect(formatTime('14:30', 'twenty-four-hour')).toBe('14:30');
		expect(formatTime('time unknown', 'twelve-hour')).toBe('time unknown');
	});
});
