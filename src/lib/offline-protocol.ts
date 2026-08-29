export const offlineMessageTypes = {
	cacheTripPages: 'cache-trip-pages',
	clearTripPages: 'clear-offline-trip-pages',
	getTripCacheStatus: 'get-offline-trip-cache-status',
	removeTripPages: 'remove-offline-trip-pages',
	tripCacheStatus: 'offline-trip-cache-status'
} as const;

export type CacheTripPagesMessage = {
	readonly type: typeof offlineMessageTypes.cacheTripPages;
	readonly homeUrl: string;
	readonly urls: readonly string[];
};

export type ClearTripPagesMessage = {
	readonly type: typeof offlineMessageTypes.clearTripPages;
};

export type GetTripCacheStatusMessage = {
	readonly type: typeof offlineMessageTypes.getTripCacheStatus;
	readonly url: string;
};

export type RemoveTripPagesMessage = {
	readonly type: typeof offlineMessageTypes.removeTripPages;
	readonly url: string;
};

export type TripCacheStatusResponse = {
	readonly type: typeof offlineMessageTypes.tripCacheStatus;
	readonly cached: boolean;
};
