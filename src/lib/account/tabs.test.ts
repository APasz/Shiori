import { describe, expect, it } from 'vitest';
import { availableAccountTabs } from './tabs';

describe('availableAccountTabs', () => {
	it('shows Administration only to the sudo user', () => {
		expect(availableAccountTabs(false).map((tab) => tab.id)).not.toContain('administration');
		expect(availableAccountTabs(true).map((tab) => tab.id)).toContain('administration');
	});
});
