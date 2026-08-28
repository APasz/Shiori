export const accountTabs = [
	{ id: 'appearance', label: 'Appearance', requiresAccountManagement: false },
	{ id: 'account', label: 'Account', requiresAccountManagement: false },
	{ id: 'administration', label: 'Administration', requiresAccountManagement: true }
] as const;

export type AccountTab = (typeof accountTabs)[number]['id'];
export type AccountTabDefinition = (typeof accountTabs)[number];

export const defaultAccountTab = 'appearance' as const satisfies AccountTab;

export function availableAccountTabs(canManageAccounts: boolean): readonly AccountTabDefinition[] {
	if (canManageAccounts) {
		return accountTabs;
	}
	return accountTabs.filter((tab) => !tab.requiresAccountManagement);
}

export function resolveAccountTab(value: string | null, canManageAccounts: boolean): AccountTab {
	const tab = accountTabs.find((candidate) => candidate.id === value);
	if (!tab || (tab.requiresAccountManagement && !canManageAccounts)) {
		return defaultAccountTab;
	}
	return tab.id;
}
