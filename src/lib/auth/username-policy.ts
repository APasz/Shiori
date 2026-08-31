export const minimumUsernameLength = 3;
export const maximumUsernameLength = 32;

export const usernamePattern = new RegExp(
	`^[a-z0-9][a-z0-9_-]{${minimumUsernameLength - 1},${maximumUsernameLength - 1}}$`,
	'i'
);

export const usernameValidationMessage = `Use ${minimumUsernameLength}–${maximumUsernameLength} characters: A–Z, 0–9, _, or -, starting with A–Z or 0–9`;

export const usernameRequirementsMessage = `${minimumUsernameLength}–${maximumUsernameLength} characters: A–Z, 0–9, _, or -. Start with A–Z or 0–9; usernames are case-insensitive`;
