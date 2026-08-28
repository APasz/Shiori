/** Caps compact account forms before parsing their request bodies. */
export const maximumAccountRequestBytes = 16 * 1024;

/** Returns whether a request declares a non-negative body size within the route's limit. */
export function hasBodySizeAtMost(request: Request, maximumBytes: number): boolean {
	if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
		throw new Error('A request-size limit must be a non-negative safe integer.');
	}

	const contentLength = request.headers.get('content-length');
	if (!contentLength || !/^\d+$/.test(contentLength)) {
		return false;
	}

	const bytes = Number(contentLength);
	return Number.isSafeInteger(bytes) && bytes <= maximumBytes;
}
