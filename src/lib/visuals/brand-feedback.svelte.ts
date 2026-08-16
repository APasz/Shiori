export const brandIconFeedbackStates = ['idle', 'loading', 'success', 'warning', 'error'] as const;

export type BrandIconFeedbackState = (typeof brandIconFeedbackStates)[number];

export function isBrandIconFeedbackState(value: string | null): value is BrandIconFeedbackState {
	return brandIconFeedbackStates.some((state) => state === value);
}

class BrandIconFeedback {
	state = $state<BrandIconFeedbackState>('idle');
	eventId = $state(0);

	publish(state: BrandIconFeedbackState): void {
		this.state = state;
		this.eventId += 1;
	}

	clear(): void {
		this.publish('idle');
	}
}

/** Coordinates the transient status treatment of the primary Shiori mark. */
export const brandIconFeedback = new BrandIconFeedback();
