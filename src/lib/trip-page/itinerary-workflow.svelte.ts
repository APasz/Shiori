import { apiErrorSchema, editSaveResponseSchema, type ItineraryItemImport } from '$lib/editing/contracts';
import { createEmptyItineraryItem, createItineraryItemFromImport } from '$lib/itinerary/draft';
import { defaultItemTimestamp } from '$lib/itinerary/presentation';
import type { ItineraryItem, ItineraryItemType } from '$lib/itinerary/schema';
import { createTransportJourneyItem, type TransportJourneyDraft } from '$lib/itinerary/transport-journey';
import { viewerContext } from '$lib/itinerary/viewer-context.svelte';
import type { DetailedTripView } from '$lib/server/store/views';
import { brandIconFeedback } from '$lib/visuals/brand-feedback.svelte';
import { refreshTripPage } from './refresh';
import { itemMutationEndpoint } from './trip';
import type { EditingItem } from './types';

type ItineraryWorkflowOptions = Readonly<{
	canModify: () => boolean;
	detailedTrip: () => DetailedTripView | null;
}>;

type ItemMutationAction = 'delete' | 'mark-cost-paid';

type PendingItemMutation = Readonly<{
	action: ItemMutationAction;
	itemId: string;
}>;

/** Owns selection and mutation state for itinerary items. */
export class ItineraryWorkflow {
	selectedItemId = $state<string | null>(null);
	editingItem = $state<EditingItem | null>(null);
	creatingItem = $state(false);
	itemCreationLocalDay = $state<string | undefined>(undefined);
	mutationError = $state<string | null>(null);
	pendingMutation = $state<PendingItemMutation | null>(null);
	readonly #options: ItineraryWorkflowOptions;

	constructor(options: ItineraryWorkflowOptions) {
		this.#options = options;
	}

	beginCreation(localDay?: string): void {
		if (!this.#options.canModify()) {
			return;
		}
		this.mutationError = null;
		this.itemCreationLocalDay = localDay;
		this.creatingItem = true;
	}

	beginManualCreation(type: ItineraryItemType): void {
		if (!this.#options.canModify()) {
			return;
		}
		this.mutationError = null;
		this.editingItem = {
			item: createEmptyItineraryItem(
				type,
				crypto.randomUUID(),
				defaultItemTimestamp(this.itemCreationLocalDay, viewerContext.timeZone, viewerContext.currentTimestamp)
			),
			mode: 'create',
			timingNeedsConfirmation: false
		};
	}

	beginImportedCreation(itemImport: ItineraryItemImport): void {
		if (!this.#options.canModify()) {
			return;
		}
		const suggestedStartDate = itemImport.suggestedStartDate ?? this.itemCreationLocalDay;
		this.mutationError = null;
		this.editingItem = {
			item: createItineraryItemFromImport(
				itemImport,
				crypto.randomUUID(),
				defaultItemTimestamp(suggestedStartDate, viewerContext.timeZone, viewerContext.currentTimestamp)
			),
			mode: 'create',
			...(itemImport.suggestedEndDate ? { suggestedEndDate: itemImport.suggestedEndDate } : {}),
			...(suggestedStartDate ? { suggestedStartDate } : {}),
			timingNeedsConfirmation: true
		};
	}

	beginTransportJourney(journey: TransportJourneyDraft): void {
		if (!this.#options.canModify()) {
			return;
		}
		const journeyDate = journey.suggestedStartDate ?? this.itemCreationLocalDay;
		this.mutationError = null;
		this.editingItem = {
			item: createTransportJourneyItem(
				journey,
				crypto.randomUUID(),
				defaultItemTimestamp(journeyDate, viewerContext.timeZone, viewerContext.currentTimestamp)
			),
			mode: 'create',
			...(journeyDate ? { suggestedStartDate: journeyDate } : {}),
			timingNeedsConfirmation: journey.schedule === undefined
		};
	}

	beginEditing(item: ItineraryItem): void {
		if (!this.#options.canModify()) {
			return;
		}
		this.mutationError = null;
		this.editingItem = { item, mode: 'edit', timingNeedsConfirmation: false };
	}

	dismissDetails(): void {
		this.mutationError = null;
		this.selectedItemId = null;
	}

	dismissEditor(): void {
		this.editingItem = null;
	}

	dismissCreator(): void {
		this.creatingItem = false;
	}

	dismissForLostConnection(): void {
		this.editingItem = null;
		this.creatingItem = false;
	}

	async delete(item: ItineraryItem): Promise<void> {
		if (!this.#options.canModify() || !window.confirm(`Delete “${item.title}”?`)) {
			return;
		}
		if (await this.mutateItem(item, 'delete', 'The itinerary item could not be deleted.')) {
			if (this.selectedItemId === item.id) {
				this.selectedItemId = null;
			}
		}
	}

	async markCostPaid(item: ItineraryItem): Promise<void> {
		if (!item.cost || item.cost.status === 'paid') {
			return;
		}
		await this.mutateItem(item, 'mark-cost-paid', 'The itinerary item cost could not be marked paid.');
	}

	private async mutateItem(item: ItineraryItem, action: ItemMutationAction, failureMessage: string): Promise<boolean> {
		const trip = this.#options.detailedTrip();
		if (!this.#options.canModify() || !trip) {
			return false;
		}

		this.pendingMutation = { action, itemId: item.id };
		this.mutationError = null;
		try {
			const response = await fetch(itemMutationEndpoint(trip), {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, itemId: item.id, revision: trip.revision })
			});
			const responseData: unknown = await response.json().catch(() => null);
			if (!response.ok || !editSaveResponseSchema.safeParse(responseData).success) {
				this.mutationError = this.errorMessage(responseData, failureMessage);
				return false;
			}
			brandIconFeedback.publish('success');
			await this.refreshPage();
			return true;
		} catch {
			this.mutationError =
				action === 'delete'
					? 'The itinerary item could not be deleted because the server is unavailable.'
					: 'The itinerary item cost could not be marked paid because the server is unavailable.';
			return false;
		} finally {
			this.pendingMutation = null;
		}
	}

	async finishEditing(): Promise<void> {
		this.editingItem = null;
		await this.refreshPage();
	}

	async finishAccommodationCreation(): Promise<void> {
		this.creatingItem = false;
		await this.refreshPage();
	}

	private errorMessage(responseData: unknown, fallback: string): string {
		const parsed = apiErrorSchema.safeParse(responseData);
		return parsed.success ? parsed.data.message : fallback;
	}

	private async refreshPage(): Promise<void> {
		await refreshTripPage();
	}
}
