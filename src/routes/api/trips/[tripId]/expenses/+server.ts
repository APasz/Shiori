import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { expenseDeleteRequestSchema, expenseSaveRequestSchema } from '$lib/editing/contracts';
import { requestJson, storeErrorResponse, unauthenticatedEditResponse } from '$lib/server/api';
import { createExpense, deleteExpense, saveExpense } from '$lib/server/store';

function invalidExpenseResponse(): Response {
	return json({ message: 'The expense is invalid.' }, { status: 400 });
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = expenseSaveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return invalidExpenseResponse();
	}

	try {
		return json(await createExpense({ ...payload.data, tripId: params.tripId, userId: locals.user.id }), {
			status: 201
		});
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = expenseSaveRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return invalidExpenseResponse();
	}

	try {
		return json(await saveExpense({ ...payload.data, tripId: params.tripId, userId: locals.user.id }));
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return unauthenticatedEditResponse();
	}

	const payload = expenseDeleteRequestSchema.safeParse(await requestJson(request));
	if (!payload.success) {
		return invalidExpenseResponse();
	}

	try {
		return json(await deleteExpense({ ...payload.data, tripId: params.tripId, userId: locals.user.id }));
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
