import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { serializeTripBackup, tripBackupFilename, tripBackupMediaType } from '$lib/trip-backup';
import { storeErrorResponse } from '$lib/server/api';
import { exportTripBackup } from '$lib/server/store/trips';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) {
		return json({ message: 'Sign in as the trip owner to back up a trip.' }, { status: 401 });
	}

	try {
		const backup = await exportTripBackup({ tripId: params.tripId, userId: user.id });
		return new Response(serializeTripBackup(backup), {
			headers: {
				'cache-control': 'no-store',
				'content-disposition': `attachment; filename="${tripBackupFilename(backup.itinerary.title)}"`,
				'content-type': `${tripBackupMediaType}; charset=utf-8`,
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
