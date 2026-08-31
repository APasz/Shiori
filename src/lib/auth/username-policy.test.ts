import { describe, expect, it } from 'vitest';
import {
	maximumUsernameLength,
	minimumUsernameLength,
	usernamePattern,
	usernameRequirementsMessage,
	usernameValidationMessage
} from './username-policy';

describe('username policy', () => {
	it('accepts the supported username characters and lengths', () => {
		expect(usernamePattern.test('Ada_123')).toBe(true);
		expect(usernamePattern.test('a'.repeat(minimumUsernameLength))).toBe(true);
		expect(usernamePattern.test('a'.repeat(maximumUsernameLength))).toBe(true);
	});

	it('rejects unsupported username characters and lengths', () => {
		expect(usernamePattern.test('ab')).toBe(false);
		expect(usernamePattern.test('-ada')).toBe(false);
		expect(usernamePattern.test('ada space')).toBe(false);
		expect(usernamePattern.test('ada$')).toBe(false);
		expect(usernamePattern.test('áda')).toBe(false);
		expect(usernamePattern.test('a'.repeat(maximumUsernameLength + 1))).toBe(false);
	});

	it('describes the username requirements consistently', () => {
		expect(usernameValidationMessage).toContain(`${minimumUsernameLength}–${maximumUsernameLength}`);
		expect(usernameRequirementsMessage).toContain('case-insensitive');
	});
});
