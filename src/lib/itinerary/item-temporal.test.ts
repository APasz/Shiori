import { describe, expect, it } from 'vitest';
import {
	resolveDayCardTemporalCandidates,
	resolveDayCardPrimaryTemporalSource,
	resolveItemCalendarDayMembership,
	resolveItemDayChronologicalPosition,
	resolveItemDetailTemporalPresentation,
	resolveItemTemporalSources,
	resolveNowNextCandidateTemporalSources,
	resolveTransportStopTemporalPresentation,
	type ItemWithTemporalSources
} from './item-temporal';
import type { AvailabilityConstraint, ItineraryItemPlacement, ItineraryTiming } from './schema';

const tripTimeZone = 'UTC';
const planStartAt = Date.UTC(2026, 3, 13, 9);
const serviceAt = Date.UTC(2026, 3, 13, 10);
const placement: ItineraryItemPlacement = { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: tripTimeZone };
const plan: ItineraryTiming = { kind: 'exact', startAt: planStartAt, timeZone: tripTimeZone };
const openingHours: AvailabilityConstraint = {
	id: 'museum-hours',
	timing: {
		endAt: Date.UTC(2026, 3, 13, 17),
		kind: 'period',
		startAt: Date.UTC(2026, 3, 13, 9),
		timeZone: tripTimeZone
	},
	type: 'opening-hours'
};

const scheduledTransport: ItemWithTemporalSources = {
	availability: [openingHours],
	timing: plan,
	transport: {
		stops: [{ locationId: 'departure', scheduledAt: serviceAt, timeZone: 'Asia/Tokyo' }]
	},
	type: 'transport'
};

const dayPlacedActivity: ItemWithTemporalSources = {
	availability: [openingHours],
	placement,
	type: 'activity'
};

const dayPlacedTransport: ItemWithTemporalSources = {
	placement,
	transport: {
		stops: [{ locationId: 'departure', scheduledAt: serviceAt, timeZone: 'Asia/Tokyo' }]
	},
	type: 'transport'
};

describe('item temporal sources', () => {
	it('keeps Plan, service, and availability as separate derived sources', () => {
		expect(resolveItemTemporalSources(scheduledTransport, tripTimeZone)).toEqual([
			{ source: 'plan', timing: plan },
			{
				at: serviceAt,
				role: 'transport-stop',
				source: 'service',
				stopIndex: 0,
				timeZone: 'Asia/Tokyo'
			},
			{ constraint: openingHours, source: 'availability' }
		]);
		expect(resolveItemTemporalSources(dayPlacedActivity, tripTimeZone)).toEqual([
			{ placement, source: 'placement' },
			{ constraint: openingHours, source: 'availability' }
		]);
	});

	it('chooses the documented day-card source without turning placement into a time', () => {
		const context = { availabilityTimestamp: Date.UTC(2026, 3, 13, 12), tripTimeZone };
		const availableTransport = { ...dayPlacedTransport, availability: [openingHours] };

		expect(resolveDayCardPrimaryTemporalSource(scheduledTransport, context)).toEqual({ source: 'plan', timing: plan });
		expect(resolveDayCardPrimaryTemporalSource(dayPlacedActivity, context)).toEqual({
			constraint: openingHours,
			source: 'availability'
		});
		expect(resolveDayCardPrimaryTemporalSource(dayPlacedTransport, context)).toEqual({
			at: serviceAt,
			role: 'transport-stop',
			source: 'service',
			stopIndex: 0,
			timeZone: 'Asia/Tokyo'
		});
		expect(resolveDayCardTemporalCandidates(availableTransport, context)).toEqual([
			{ constraint: openingHours, source: 'availability' },
			{
				at: serviceAt,
				role: 'transport-stop',
				source: 'service',
				stopIndex: 0,
				timeZone: 'Asia/Tokyo'
			}
		]);
		expect(resolveDayCardPrimaryTemporalSource({ placement, type: 'activity' }, context)).toBeUndefined();
	});

	it('uses Plan alone for intra-day chronology while placement determines only day membership', () => {
		expect(resolveItemDayChronologicalPosition(scheduledTransport, '2026-04-13', tripTimeZone)).toEqual({
			at: planStartAt,
			source: 'plan',
			timing: plan
		});
		expect(resolveItemDayChronologicalPosition(dayPlacedTransport, '2026-04-13', tripTimeZone)).toBeUndefined();
		expect(resolveItemCalendarDayMembership(dayPlacedTransport, tripTimeZone)).toEqual({
			endDate: '2026-04-13',
			placement,
			source: 'placement',
			startDate: '2026-04-13'
		});
	});

	it('uses Plan or placed opening-hours sources for Now / Next, never transport service', () => {
		expect(resolveNowNextCandidateTemporalSources(scheduledTransport)).toEqual([{ source: 'plan', timing: plan }]);
		expect(resolveNowNextCandidateTemporalSources(dayPlacedActivity)).toEqual([
			{ constraint: openingHours, source: 'availability' }
		]);
		expect(resolveNowNextCandidateTemporalSources(dayPlacedTransport)).toEqual([]);
	});

	it('keeps item-detail Schedule/Day presentation separate from service-stop presentation', () => {
		expect(resolveItemDetailTemporalPresentation(scheduledTransport)).toEqual({
			availabilityContextTimestamps: [planStartAt, planStartAt],
			kind: 'plan',
			source: { source: 'plan', timing: plan }
		});
		expect(resolveItemDetailTemporalPresentation(dayPlacedTransport)).toEqual({
			availabilityContextTimestamps: [placement.anchorAt],
			kind: 'placement',
			source: { placement, source: 'placement' }
		});
	});

	it('prefers an explicit service stop over Plan only in the transport-stop display context', () => {
		const explicitStop = { locationId: 'departure', scheduledAt: serviceAt, timeZone: 'Asia/Tokyo' };
		const untimedStop = { locationId: 'departure' };

		expect(resolveTransportStopTemporalPresentation(plan, explicitStop, 0, tripTimeZone)).toMatchObject({
			at: serviceAt,
			source: 'service',
			timeZone: 'Asia/Tokyo'
		});
		expect(resolveTransportStopTemporalPresentation(plan, untimedStop, 0, tripTimeZone)).toMatchObject({
			at: planStartAt,
			source: 'plan',
			timeZone: tripTimeZone
		});
	});
});
