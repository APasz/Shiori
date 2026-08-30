export const unixEpochMilliseconds = 0;
export const unixEpochDateTime = '1970-01-01T00:00';
export const unixEpochDate = unixEpochDateTime.slice(0, 10);

export function isOnOrAfterUnixEpoch(timestamp: number): boolean {
	return timestamp >= unixEpochMilliseconds;
}
