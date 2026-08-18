import type { RequestHandler } from './$types';

/** Confirms that this Shiori server can receive uncached browser requests. */
export const GET: RequestHandler = () => {
	const headers = new Headers({ 'cache-control': 'no-store' });
	const releaseId = process.env.SHIORI_RELEASE_ID;
	if (releaseId) {
		headers.set('x-shiori-release', releaseId);
	}
	return new Response(null, { headers, status: 204 });
};
