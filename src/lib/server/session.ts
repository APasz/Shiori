export const sessionCookieName = 'shiori_session';
export const sessionLifetimeSeconds = 7 * 24 * 60 * 60;
export const sessionLifetimeMilliseconds = sessionLifetimeSeconds * 1000;

export function sessionCookieOptions(url: URL) {
	return {
		httpOnly: true,
		maxAge: sessionLifetimeSeconds,
		path: '/',
		sameSite: 'lax' as const,
		secure: url.protocol === 'https:'
	};
}
