import { describe, expect, it } from 'vitest';
import { hasBodySizeAtMost } from './request-size';

describe('request body size checks', () => {
	it('accepts only an explicitly declared body size within the configured limit', () => {
		expect(
			hasBodySizeAtMost(new Request('https://shiori.example/login', { headers: { 'content-length': '1024' } }), 1024)
		).toBe(true);
		expect(
			hasBodySizeAtMost(new Request('https://shiori.example/login', { headers: { 'content-length': '1025' } }), 1024)
		).toBe(false);
		expect(hasBodySizeAtMost(new Request('https://shiori.example/login'), 1024)).toBe(false);
	});
});
