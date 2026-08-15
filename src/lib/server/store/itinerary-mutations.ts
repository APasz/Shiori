import {
	expenseSchema,
	itineraryIdentifierSchema,
	itineraryNoteSchema,
	itineraryNoteTargetSchema,
	tripDetailsSchema,
	type ItineraryNote,
	type TripDetails
} from '$lib/itinerary/schema';
import { StoreError } from './error';
import { transaction } from './persistence';
import { assertExpectedRevision, assertNoActiveEditLock, commitItineraryChange, getTripForMutation } from './trips';

type VersionedTripMutation = {
	revision: number;
	tripId: string;
	userId: string;
};

function noteMatchesTarget(note: ItineraryNote, target: { kind: 'trip' } | { date: string; kind: 'day' }): boolean {
	return target.kind === 'trip' ? note.kind === 'trip' : note.kind === 'day' && note.date === target.date;
}

function noteHasContent(note: ItineraryNote): boolean {
	return note.text.trim() !== '' || note.entries.length > 0;
}

export async function saveTripDetails(
	input: VersionedTripMutation & { details: unknown }
): Promise<{ revision: number }> {
	const details: TripDetails = tripDetailsSchema.parse(input.details);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		return commitItineraryChange(trip, { ...trip.itinerary, ...details });
	});
}

export async function saveNote(input: VersionedTripMutation & { note: unknown }): Promise<{ revision: number }> {
	const note = itineraryNoteSchema.parse(input.note);
	if (!noteHasContent(note)) {
		throw new StoreError(400, 'Add text or at least one structured entry before saving a note.');
	}

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		const notes = trip.itinerary.notes.filter((existingNote) => !noteMatchesTarget(existingNote, note));
		return commitItineraryChange(trip, { ...trip.itinerary, notes: [...notes, note] });
	});
}

export async function deleteNote(input: VersionedTripMutation & { target: unknown }): Promise<{ revision: number }> {
	const target = itineraryNoteTargetSchema.parse(input.target);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		if (!trip.itinerary.notes.some((note) => noteMatchesTarget(note, target))) {
			throw new StoreError(404, 'Note not found.');
		}
		return commitItineraryChange(trip, {
			...trip.itinerary,
			notes: trip.itinerary.notes.filter((note) => !noteMatchesTarget(note, target))
		});
	});
}

export async function createExpense(
	input: VersionedTripMutation & { expense: unknown }
): Promise<{ revision: number }> {
	const expense = expenseSchema.parse(input.expense);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		if (trip.itinerary.expenses.some((existingExpense) => existingExpense.id === expense.id)) {
			throw new StoreError(409, 'An expense already uses this ID.');
		}
		return commitItineraryChange(trip, { ...trip.itinerary, expenses: [...trip.itinerary.expenses, expense] });
	});
}

export async function saveExpense(input: VersionedTripMutation & { expense: unknown }): Promise<{ revision: number }> {
	const expense = expenseSchema.parse(input.expense);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		const expenseIndex = trip.itinerary.expenses.findIndex((existingExpense) => existingExpense.id === expense.id);
		if (expenseIndex < 0) {
			throw new StoreError(404, 'Expense not found.');
		}
		const expenses = trip.itinerary.expenses.map((existingExpense, index) =>
			index === expenseIndex ? expense : existingExpense
		);
		return commitItineraryChange(trip, { ...trip.itinerary, expenses });
	});
}

export async function deleteExpense(
	input: VersionedTripMutation & { expenseId: string }
): Promise<{ revision: number }> {
	const expenseId = itineraryIdentifierSchema.parse(input.expenseId);

	return transaction((data) => {
		const trip = getTripForMutation(data, input.tripId, input.userId);
		assertExpectedRevision(trip, input.revision);
		assertNoActiveEditLock(data, trip);
		if (!trip.itinerary.expenses.some((expense) => expense.id === expenseId)) {
			throw new StoreError(404, 'Expense not found.');
		}
		const linkedItem = trip.itinerary.items.find((item) => item.linkedExpenseIds.includes(expenseId));
		if (linkedItem) {
			throw new StoreError(409, `Remove this expense from “${linkedItem.title}” before deleting it.`);
		}
		return commitItineraryChange(trip, {
			...trip.itinerary,
			expenses: trip.itinerary.expenses.filter((expense) => expense.id !== expenseId)
		});
	});
}
