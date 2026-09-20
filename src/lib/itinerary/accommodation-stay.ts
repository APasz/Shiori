import {
	itineraryItemDraftSchema,
	type AvailabilityConstraint,
	type CurrencyCode,
	type ItineraryItemDraft,
	type ItineraryLink,
	type ItineraryLocation,
	type ReservationStatus
} from './schema';
import { isOnOrAfterUnixEpoch } from './unix-time';
import { amountMinorFromInput } from '$lib/money';
import { zonedDateTimeToUnixMilliseconds } from './zoned-time';

type AccommodationCostInput = Readonly<{
	amount: string;
	currency: CurrencyCode;
	scheduledPaymentDate?: string;
	status: 'paid' | 'unpaid';
}>;

type AccommodationReservationInput = Readonly<{
	provider?: string;
	reference?: string;
	status: ReservationStatus;
}>;

type AccommodationBoundary = 'check-in' | 'check-out';

/** Published property rules are distinct from booking-specific stay boundaries. */
export type AccommodationPublishedTimesInput = Readonly<{
	checkInTime?: string;
	checkOutTime?: string;
}>;

type PublishedTimeConstraintInput = Readonly<{
	boundary: AccommodationBoundary;
	date: string;
	time?: string;
}>;

type PublishedTimeConstraintValidation =
	Readonly<{ availability: AvailabilityConstraint[]; valid: true }> | Readonly<{ error: string; valid: false }>;

export type AccommodationStayInput = Readonly<{
	address?: string;
	checkInDate: string;
	checkInTime?: string;
	checkOutDate: string;
	checkOutTime?: string;
	coordinates?: ItineraryLocation['coordinates'];
	cost?: AccommodationCostInput;
	googleMapsUrl?: string;
	id: string;
	links: readonly ItineraryLink[];
	locationId: string;
	name: string;
	publishedTimes?: AccommodationPublishedTimesInput;
	reservation?: AccommodationReservationInput;
	timesKnown: boolean;
	timeZone: string;
	title: string;
}>;

export type AccommodationStayValidation =
	Readonly<{ item: ItineraryItemDraft; valid: true }> | Readonly<{ error: string; valid: false }>;

function optionalText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === '' || trimmed === undefined ? undefined : trimmed;
}

function stayTimestamp(date: string, time: string, timeZone: string): number | null {
	return zonedDateTimeToUnixMilliseconds(`${date}T${time}`, timeZone);
}

function dateOnlyStayTimestamp(date: string, boundary: 'start' | 'end', timeZone: string): number | null {
	return stayTimestamp(date, boundary === 'start' ? '00:00' : '23:59', timeZone);
}

function publishedTimeConstraint(
	boundary: AccommodationBoundary,
	at: number,
	timeZone: string
): AvailabilityConstraint {
	return {
		id: `property-${boundary}`,
		timing: { at, kind: boundary === 'check-in' ? 'from' : 'until', timeZone },
		type: boundary
	};
}

function publishedTimeConstraints(input: AccommodationStayInput): PublishedTimeConstraintValidation {
	const times: readonly PublishedTimeConstraintInput[] = [
		{ boundary: 'check-in', date: input.checkInDate, time: input.publishedTimes?.checkInTime },
		{ boundary: 'check-out', date: input.checkOutDate, time: input.publishedTimes?.checkOutTime }
	];
	const availability: AvailabilityConstraint[] = [];
	for (const { boundary, date, time } of times) {
		if (time === undefined) {
			continue;
		}
		const at = stayTimestamp(date, time, input.timeZone);
		if (at === null) {
			return { error: `Published ${boundary} time: choose a valid local time.`, valid: false };
		}
		availability.push(publishedTimeConstraint(boundary, at, input.timeZone));
	}
	return { availability, valid: true };
}

/** Builds a fully validated accommodation item from the focused stay-creation wizard inputs. */
export function accommodationStayDraft(input: AccommodationStayInput): AccommodationStayValidation {
	const checkIn = input.timesKnown
		? stayTimestamp(input.checkInDate, input.checkInTime ?? '', input.timeZone)
		: dateOnlyStayTimestamp(input.checkInDate, 'start', input.timeZone);
	if (checkIn === null) {
		return {
			error: input.timesKnown ? 'Check-in: choose a valid local date and time.' : 'Check-in: choose a valid date.',
			valid: false
		};
	}
	if (!isOnOrAfterUnixEpoch(checkIn)) {
		return { error: 'Check-in must be on or after the Unix epoch.', valid: false };
	}
	const checkOut = input.timesKnown
		? stayTimestamp(input.checkOutDate, input.checkOutTime ?? '', input.timeZone)
		: dateOnlyStayTimestamp(input.checkOutDate, 'end', input.timeZone);
	if (checkOut === null) {
		return {
			error: input.timesKnown ? 'Check-out: choose a valid local date and time.' : 'Check-out: choose a valid date.',
			valid: false
		};
	}
	if (!isOnOrAfterUnixEpoch(checkOut)) {
		return { error: 'Check-out must be on or after the Unix epoch.', valid: false };
	}
	if (checkOut <= checkIn) {
		return { error: 'Check-out must be after check-in.', valid: false };
	}

	const publishedTimes = publishedTimeConstraints(input);
	if (!publishedTimes.valid) {
		return publishedTimes;
	}

	const costAmountMinor = input.cost ? amountMinorFromInput(input.cost.amount, input.cost.currency) : null;
	if (input.cost && (costAmountMinor === null || costAmountMinor < 1)) {
		return { error: 'Cost: enter an amount greater than zero.', valid: false };
	}

	const name = input.name.trim();
	const title = input.title.trim();
	const address = optionalText(input.address);
	const googleMapsUrl = optionalText(input.googleMapsUrl);
	const provider = optionalText(input.reservation?.provider);
	const reference = optionalText(input.reservation?.reference);
	const candidate = itineraryItemDraftSchema.safeParse({
		availability: publishedTimes.availability,
		id: input.id,
		timing: {
			kind: 'exact',
			startAt: checkIn,
			endAt: checkOut,
			...(input.timesKnown ? {} : { timePrecision: 'date' as const }),
			timeZone: input.timeZone
		},
		title,
		type: 'accommodation',
		locations: [
			{
				id: input.locationId,
				name,
				role: 'primary',
				...(address ? { address } : {}),
				...(googleMapsUrl ? { googleMapsUrl } : {}),
				...(input.coordinates ? { coordinates: input.coordinates } : {})
			}
		],
		notes: [],
		links: [...input.links],
		documents: [],
		...(input.reservation
			? {
					reservation: {
						status: input.reservation.status,
						...(provider ? { provider } : {}),
						...(reference ? { reference } : {})
					}
				}
			: {}),
		...(input.cost && costAmountMinor !== null
			? {
					cost: {
						amountMinor: costAmountMinor,
						currency: input.cost.currency,
						...(input.cost.scheduledPaymentDate ? { scheduledPaymentDate: input.cost.scheduledPaymentDate } : {}),
						status: input.cost.status
					}
				}
			: {})
	});
	return candidate.success
		? { item: candidate.data, valid: true }
		: { error: 'Check the accommodation details before saving.', valid: false };
}
