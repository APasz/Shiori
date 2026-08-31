import { describe, expect, it } from 'vitest';
import {
	developmentMinimumPasswordLength,
	maximumPasswordLength,
	passwordConfirmationMessage,
	passwordMaximumMessage,
	passwordMinimumFor,
	passwordMinimumMessage,
	passwordRequirementsMessage,
	productionMinimumPasswordLength
} from './password-policy';

describe('password policy', () => {
	it('allows a one-character password only in development', () => {
		expect(passwordMinimumFor(true)).toBe(developmentMinimumPasswordLength);
		expect(passwordMinimumFor(false)).toBe(productionMinimumPasswordLength);
	});

	it('uses a grammatical validation message for each password minimum', () => {
		expect(passwordMinimumMessage(developmentMinimumPasswordLength)).toBe('Use at least 1 character for a password');
		expect(passwordMinimumMessage(productionMinimumPasswordLength)).toBe('Use at least 12 characters for a password');
	});

	it('uses the configured maximum in its validation message', () => {
		expect(passwordMaximumMessage()).toBe(
			`Use at most ${maximumPasswordLength.toLocaleString('en-US')} characters for a password`
		);
	});

	it('describes the supported password length and characters', () => {
		expect(passwordRequirementsMessage(developmentMinimumPasswordLength)).toBe(
			`Use 1–${maximumPasswordLength.toLocaleString('en-US')} characters; spaces and symbols are allowed`
		);
		expect(passwordRequirementsMessage(productionMinimumPasswordLength)).toBe(
			`Use 12–${maximumPasswordLength.toLocaleString('en-US')} characters; spaces and symbols are allowed`
		);
	});

	it('uses one shared confirmation message', () => {
		expect(passwordConfirmationMessage).toBe('Must match the password above');
	});
});
