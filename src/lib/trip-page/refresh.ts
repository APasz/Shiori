import { invalidateAll } from '$app/navigation';
import { refreshOfflineTripPage } from '$lib/offline';

/** Reloads route data and updates the cached offline trip after a successful mutation. */
export async function refreshTripPage(): Promise<void> {
	await invalidateAll();
	refreshOfflineTripPage();
}
