import { describe, expect, it } from 'vitest';
import { applicationTitle, browserPages, browserTitle } from './browser-title';

describe('browserTitle', () => {
	it('uses Shiori as the title context when a trip is not supplied', () => {
		expect(browserTitle(browserPages.trips)).toBe('Shiori/Trips');
	});

	it('uses the trip title as the title context when supplied', () => {
		expect(browserTitle(browserPages.notes, 'Kyoto')).toBe('Kyoto/Notes');
	});

	it('defines the application title once', () => {
		expect(applicationTitle).toBe('Shiori');
	});
});
