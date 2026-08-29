export const applicationTitle = 'Shiori';

export const browserPages = {
	account: 'Account',
	access: 'Access',
	admin: 'Admin',
	costs: 'Costs',
	itinerary: 'Itinerary',
	login: 'Sign in',
	notes: 'Notes',
	offline: 'Offline',
	setup: 'Set up',
	trips: 'Trips'
} as const;

export type BrowserPage = (typeof browserPages)[keyof typeof browserPages];

export function browserTitle(page: BrowserPage, tripTitle: string = applicationTitle): string {
	return `${tripTitle}/${page}`;
}
