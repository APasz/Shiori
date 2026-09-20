export type TransportStopSchedule = Readonly<{
	scheduledAt: number;
	timeZone: string;
}>;

export type TransportPlanStart = Readonly<{
	at: number;
	timeZone: string;
}>;

/**
 * Resolves the exact Plan start saved by the transport editor. An entered Plan wins; an explicit
 * first-stop service time only supplies the editor's otherwise blank Plan input.
 */
export function resolveTransportPlanStartForEditor(
	planStart: TransportPlanStart | undefined,
	firstStopServiceTime: TransportStopSchedule | undefined
): TransportPlanStart | undefined {
	return (
		planStart ??
		(firstStopServiceTime === undefined
			? undefined
			: { at: firstStopServiceTime.scheduledAt, timeZone: firstStopServiceTime.timeZone })
	);
}
