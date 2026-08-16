export const sessionCookieName = 'shiori_session';
export const sessionLifetimeSeconds = 7 * 24 * 60 * 60;
export const sessionLifetimeMilliseconds = sessionLifetimeSeconds * 1000;
export const sessionRefreshCadenceMilliseconds = 9 * 60 * 60 * 1000;

/** Returns whether this session has not had its idle timeout renewed within the configured cadence. */
export function isSessionRefreshDue(expiresAt: number): boolean {
	return expiresAt - Date.now() <= sessionLifetimeMilliseconds - sessionRefreshCadenceMilliseconds;
}

export function sessionCookieOptions(url: URL) {
	return {
		httpOnly: true,
		maxAge: sessionLifetimeSeconds,
		path: '/',
		sameSite: 'lax' as const,
		secure: url.protocol === 'https:'
	};
}
