import {
	itineraryItemDraftSchema,
	type Itinerary,
	type ItineraryItem,
	type ItineraryItemDraft
} from '$lib/itinerary/schema';
import { StoreError } from './error';
import { assertActiveLock } from './edit-locks';
import { persistedItemForCost } from './item-costs';
import { tripStructureLockTargetId } from './model';
import { readData, transaction } from './persistence';
import {
	assertExpectedRevision,
	assertNoActiveEditLock,
	commitItineraryChange,
	findItemIndex,
	getTripForMutation
} from './trips';

type VersionedTripMutation = {
	revision: number;
	tripId: string;
	userId: string;
};

function assertNewLinkedExpensesAreSelectable(
	itinerary: Itinerary,
	item: ItineraryItemDraft,
	existingItem?: ItineraryItem
): void {
	const existingLinkedExpenseIds = new Set(existingItem?.linkedExpenseIds ?? []);
	const linkedExpenseIds = new Set<string>();
	for (const expenseId of item.linkedExpenseIds) {
		if (linkedExpenseIds.has(expenseId)) {
			throw new StoreError(400, 'An itinerary item cannot link the same expense more than once.');
		}
		linkedExpenseIds.add(expenseId);
		const expense = itinerary.expenses.find((candidate) => candidate.id === expenseId);
		if (!expense) {
			throw new StoreError(400, 'A linked expense no longer exists. Reload and try again.');
		}
		if (!expense.availableForItemCosts && !existingLinkedExpenseIds.has(expenseId)) {
			throw new StoreError(400, 'This expense is not available to link to itinerary items.');
		}
	}
}

export async function saveItem(
	input: VersionedTripMutation & { item: unknown; itemId: string; lockToken: string }
): Promise<{ revision: number }> {
	const item = itineraryItemDraftSchema.parse(input.item);
	if (item.id !== input.itemId) {
		throw new StoreError(400, 'An item ID cannot be changed while editing.');
	}
	const preflightData = await readData();
	const preflightTrip = getTripForMutation(preflightData, input.tripId, input.userId);
	assertExpectedRevision(preflightTrip, input.revision);
	assertActiveLock(preflightData, { ...input, targetId: input.itemId });
	const existingItem = preflightTrip.itinerary.items.find((candidate) => candidate.id === input.itemId);
	if (!existingItem) {
		throw new StoreError(404, 'Itinerary item not found.');
	}
	assertNewLinkedExpensesAreSelectable(preflightTrip.itinerary, item, existingItem);
	const persistedItem = await persistedItemForCost(item, preflightTrip.itinerary.localCurrency, existingItem);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		const lock = assertActiveLock(data, { ...input, targetId: input.itemId });
		const itemIndex = findItemIndex(trip.itinerary, input.itemId);
		if (itemIndex < 0) {
			throw new StoreError(404, 'Itinerary item not found.');
		}
		const items = trip.itinerary.items.map((existingItem, index) =>
			index === itemIndex ? persistedItem : existingItem
		);
		const result = commitItineraryChange(trip, { ...trip.itinerary, items });
		data.editLocks = data.editLocks.filter((candidate) => candidate.token !== lock.token);
		return result;
	});
}

export async function createItem(
	input: VersionedTripMutation & { item: unknown; lockToken: string }
): Promise<{ revision: number }> {
	const item = itineraryItemDraftSchema.parse(input.item);
	const preflightData = await readData();
	const preflightTrip = getTripForMutation(preflightData, input.tripId, input.userId);
	assertExpectedRevision(preflightTrip, input.revision);
	assertActiveLock(preflightData, { ...input, targetId: tripStructureLockTargetId });
	if (findItemIndex(preflightTrip.itinerary, item.id) >= 0) {
		throw new StoreError(409, 'An itinerary item already uses this ID.');
	}
	assertNewLinkedExpensesAreSelectable(preflightTrip.itinerary, item);
	const persistedItem = await persistedItemForCost(item, preflightTrip.itinerary.localCurrency, undefined);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		const lock = assertActiveLock(data, { ...input, targetId: tripStructureLockTargetId });
		if (findItemIndex(trip.itinerary, persistedItem.id) >= 0) {
			throw new StoreError(409, 'An itinerary item already uses this ID.');
		}
		const result = commitItineraryChange(trip, {
			...trip.itinerary,
			items: [...trip.itinerary.items, persistedItem]
		});
		data.editLocks = data.editLocks.filter((candidate) => candidate.token !== lock.token);
		return result;
	});
}

export async function deleteItem(input: VersionedTripMutation & { itemId: string }): Promise<{ revision: number }> {
	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		const itemIndex = findItemIndex(trip.itinerary, input.itemId);
		if (itemIndex < 0) {
			throw new StoreError(404, 'Itinerary item not found.');
		}
		return commitItineraryChange(trip, {
			...trip.itinerary,
			items: trip.itinerary.items.filter((_, index) => index !== itemIndex)
		});
	});
}
