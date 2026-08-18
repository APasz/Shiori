/** Allows anonymous public itinerary responses to be reused briefly while retaining bounded staleness. */
export const publicTripCacheControl = 'public, max-age=60, stale-while-revalidate=300';
