import { describe, expect, it } from 'vitest';
import { itineraryIllustration } from './illustration';

describe('itinerary illustrations', () => {
	it('uses the item type for activity and accommodation illustrations', () => {
		expect(itineraryIllustration({ type: 'activity' })).toBe('activity');
		expect(itineraryIllustration({ type: 'accommodation' })).toBe('accommodation');
	});

	it('uses the generic route illustration when a transport mode is private', () => {
		expect(itineraryIllustration({ type: 'transport' })).toBe('route');
	});

	it.each([
		['air', 'air'],
		['bus', 'bus'],
		['car', 'car'],
		['ride-share', 'car'],
		['ferry', 'ferry'],
		['rail', 'rail'],
		['walk', 'walk'],
		['other', 'route']
	] as const)('uses the %s transport illustration', (mode, expectedIllustration) => {
		expect(itineraryIllustration({ type: 'transport', transport: { mode } })).toBe(expectedIllustration);
	});
});
