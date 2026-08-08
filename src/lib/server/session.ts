export const sessionCookieName = 'shiori_session';

export function sessionCookieOptions(url: URL) {
	return {
		httpOnly: true,
		maxAge: 7 * 24 * 60 * 60,
		path: '/',
		sameSite: 'lax' as const,
		secure: url.protocol === 'https:'
	};
}
