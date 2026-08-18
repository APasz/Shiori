import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { itemCreateRequestSchema, itemMutationRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { createItem, deleteItem, markItemCostPaid } from '$lib/server/store/items';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = itemCreateRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The new itinerary item is invalid.' }, { status: 400 });
	}

	try {
		return json(await createItem({ ...payload.data, tripId: params.tripId, userId: locals.user.id }), { status: 201 });
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = itemMutationRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return json({ message: 'The itinerary change is invalid.' }, { status: 400 });
	}

	try {
		const input = { ...payload.data, tripId: params.tripId, userId: locals.user.id };
		return json(await (input.action === 'delete' ? deleteItem(input) : markItemCostPaid(input)));
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
