import { describe, expect, it } from 'vitest';
import {
	developmentMinimumPasswordLength,
	passwordMinimumMessage,
	passwordMinimumFor,
	productionMinimumPasswordLength
} from './password-policy';

describe('password policy', () => {
	it('allows a one-character password only in development', () => {
		expect(passwordMinimumFor(true)).toBe(developmentMinimumPasswordLength);
		expect(passwordMinimumFor(false)).toBe(productionMinimumPasswordLength);
	});

	it('uses a grammatical validation message for each password minimum', () => {
		expect(passwordMinimumMessage(developmentMinimumPasswordLength)).toBe('Use at least 1 character for a password.');
		expect(passwordMinimumMessage(productionMinimumPasswordLength)).toBe('Use at least 12 characters for a password.');
	});
});
