import { json } from '@sveltejs/kit';
import { StoreError } from './store';

export function unauthenticatedEditResponse(): Response {
	return json({ message: 'Sign in as the trip owner to edit an itinerary.' }, { status: 401 });
}

export function storeErrorResponse(error: unknown): Response {
	if (error instanceof StoreError) {
		return json({ message: error.message }, { status: error.status });
	}

	return json({ message: 'The itinerary change could not be completed.' }, { status: 500 });
}

export async function requestJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}
