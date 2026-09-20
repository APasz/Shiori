import { describe, expect, it } from 'vitest';
import { transportStopScheduledTimeLabel } from './transport-stop-presentation';

describe('transport stop presentation', () => {
	it('labels transport service times by stop role', () => {
		expect(transportStopScheduledTimeLabel('departure')).toBe('Scheduled departure');
		expect(transportStopScheduledTimeLabel('arrival')).toBe('Scheduled arrival');
		expect(transportStopScheduledTimeLabel('via')).toBe('Scheduled stop');
	});
});
