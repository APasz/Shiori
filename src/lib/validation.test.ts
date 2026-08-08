import { describe, expect, it } from 'vitest';
import { formatValidationIssues } from './validation';

describe('validation issue formatting', () => {
	it('uses a readable path and root label for nested and root-level issues', () => {
		expect(
			formatValidationIssues([
				{ message: 'Required.', path: ['items', 1, 'title'] },
				{ message: 'Invalid document.', path: [] }
			])
		).toBe('items.1.title: Required.\ndocument: Invalid document.');
	});
});
