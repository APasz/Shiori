import { dev } from '$app/environment';

export const productionMinimumPasswordLength = 12;
export const developmentMinimumPasswordLength = 1;

export function passwordMinimumFor(isDevelopment: boolean): number {
	return isDevelopment ? developmentMinimumPasswordLength : productionMinimumPasswordLength;
}

export const minimumPasswordLength = passwordMinimumFor(dev);

export function passwordMinimumMessage(minimumLength = minimumPasswordLength): string {
	return `Use at least ${minimumLength} character${minimumLength === 1 ? '' : 's'} for a password.`;
}
