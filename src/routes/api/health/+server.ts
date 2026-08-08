import type { RequestHandler } from './$types';

/** Confirms that this Shiori server can receive uncached browser requests. */
export const GET: RequestHandler = () => new Response(null, { status: 204 });
