export function timestamp(): number {
	return Date.now();
}

export function futureTimestamp(milliseconds: number): number {
	return timestamp() + milliseconds;
}

export function isExpired(expiresAt: number): boolean {
	return expiresAt <= timestamp();
}
