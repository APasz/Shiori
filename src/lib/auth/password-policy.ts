import { dev } from '$app/environment';

export const productionMinimumPasswordLength = 12;
export const developmentMinimumPasswordLength = 1;
export const maximumPasswordLength = 1024;

export function passwordMinimumFor(isDevelopment: boolean): number {
	return isDevelopment ? developmentMinimumPasswordLength : productionMinimumPasswordLength;
}

export const minimumPasswordLength = passwordMinimumFor(dev);

export function passwordMinimumMessage(minimumLength = minimumPasswordLength): string {
	return `Use at least ${minimumLength} character${minimumLength === 1 ? '' : 's'} for a password`;
}

export function passwordMaximumMessage(maximumLength = maximumPasswordLength): string {
	return `Use at most ${maximumLength.toLocaleString('en-US')} characters for a password`;
}

export function passwordRequirementsMessage(minimumLength = minimumPasswordLength): string {
	return `Use ${minimumLength}–${maximumPasswordLength.toLocaleString('en-US')} characters; spaces and symbols are allowed`;
}

export const passwordConfirmationMessage = 'Must match the password above';
