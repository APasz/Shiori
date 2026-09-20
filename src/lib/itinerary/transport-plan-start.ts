import type { TransportServiceTime } from './transport-service-timing';

export type TransportPlanStart = Readonly<{
	at: number;
	timeZone: string;
}>;

/**
 * Resolves the exact Plan start saved by the transport editor. An entered Plan wins; an explicit
 * first scheduled service time only supplies the editor's otherwise blank Plan input.
 */
export function resolveTransportPlanStartForEditor(
	planStart: TransportPlanStart | undefined,
	firstServiceTime: TransportServiceTime | undefined
): TransportPlanStart | undefined {
	return (
		planStart ??
		(firstServiceTime === undefined ? undefined : { at: firstServiceTime.at, timeZone: firstServiceTime.timeZone })
	);
}
