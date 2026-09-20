import { describe, expect, it } from 'vitest';
import {
	resolveDayCardPrimaryTemporalSource,
	resolveItemDayChronologicalPosition,
	resolveItemDetailTemporalSources,
	resolveNowNextCandidateTemporalSources,
	type ItemWithTemporalSources
} from './item-temporal';
import type { AvailabilityConstraint, ItineraryItemPlacement, ItineraryTiming } from './schema';

const tripTimeZone = 'UTC';
const day = '2026-04-13';
const planAt = Date.UTC(2026, 3, 13, 9);
const serviceAt = Date.UTC(2026, 3, 13, 10);
const placement: ItineraryItemPlacement = { anchorAt: Date.UTC(2026, 3, 13, 12), timeZone: tripTimeZone };
const plan: ItineraryTiming = { kind: 'exact', startAt: planAt, timeZone: tripTimeZone };
const openingHours: AvailabilityConstraint = {
	id: 'opening-hours',
	timing: {
		endAt: Date.UTC(2026, 3, 13, 17),
		kind: 'period',
		startAt: Date.UTC(2026, 3, 13, 9),
		timeZone: tripTimeZone
	},
	type: 'opening-hours'
};
const receptionHours: AvailabilityConstraint = {
	id: 'reception-hours',
	timing: {
		endAt: Date.UTC(2026, 3, 13, 17),
		kind: 'period',
		startAt: Date.UTC(2026, 3, 13, 9),
		timeZone: tripTimeZone
	},
	type: 'reception-hours'
};
const storageHours: AvailabilityConstraint = {
	id: 'storage-hours',
	timing: {
		endAt: Date.UTC(2026, 3, 13, 17),
		kind: 'period',
		startAt: Date.UTC(2026, 3, 13, 9),
		timeZone: tripTimeZone
	},
	type: 'storage-hours'
};
const cutoff: AvailabilityConstraint = {
	id: 'ticket-cutoff',
	timing: { at: Date.UTC(2026, 3, 13, 9, 30), kind: 'until', timeZone: tripTimeZone },
	type: 'cutoff'
};
const propertyCheckIn: AvailabilityConstraint = {
	id: 'property-check-in',
	timing: { at: Date.UTC(2026, 3, 13, 14), kind: 'from', timeZone: tripTimeZone },
	type: 'check-in'
};
const propertyCheckOut: AvailabilityConstraint = {
	id: 'property-check-out',
	timing: { at: Date.UTC(2026, 3, 14, 10), kind: 'until', timeZone: tripTimeZone },
	type: 'check-out'
};

type TemporalFixture = Readonly<{
	availability?: readonly AvailabilityConstraint[];
	includePlacement?: boolean;
	includePlan?: boolean;
	includeService?: boolean;
	serviceTimestamp?: number;
}>;

function temporalItem({
	availability,
	includePlacement = false,
	includePlan = false,
	includeService = false,
	serviceTimestamp = serviceAt
}: TemporalFixture = {}): ItemWithTemporalSources {
	return {
		...(availability === undefined ? {} : { availability }),
		...(includePlacement ? { placement } : {}),
		...(includePlan ? { timing: plan } : {}),
		...(includeService
			? {
					transport: {
						stops: [{ locationId: 'departure', scheduledAt: serviceTimestamp, timeZone: tripTimeZone }]
					}
				}
			: {}),
		type: includeService ? 'transport' : 'activity'
	};
}

describe('item temporal policies', () => {
	describe('day-card display source matrix', () => {
		const cases: readonly Readonly<{
			expectedSource: 'availability' | 'plan' | 'service' | undefined;
			item: ItemWithTemporalSources;
			name: string;
		}>[] = [
			{
				expectedSource: 'plan',
				item: temporalItem({
					availability: [openingHours],
					includePlacement: true,
					includePlan: true,
					includeService: true
				}),
				name: 'Plan wins over service, availability, and placement'
			},
			{
				expectedSource: 'service',
				item: temporalItem({ availability: [openingHours], includePlacement: true, includeService: true }),
				name: 'first transport service time wins over opening-hours availability'
			},
			{
				expectedSource: 'availability',
				item: temporalItem({ availability: [openingHours], includePlacement: true }),
				name: 'opening-hours availability is used when Plan and service are absent'
			},
			{
				expectedSource: undefined,
				item: temporalItem({ includePlacement: true }),
				name: 'placement alone produces the Time not set fallback'
			}
		];

		for (const scenario of cases) {
			it(scenario.name, () => {
				expect(
					resolveDayCardPrimaryTemporalSource(scenario.item, {
						availabilityTimestamp: placement.anchorAt,
						tripTimeZone
					})?.source
				).toBe(scenario.expectedSource);
			});
		}
	});

	describe('day ordering source matrix', () => {
		const cases: readonly Readonly<{
			expectedAt: number | undefined;
			expectedSource: 'plan' | 'service' | undefined;
			item: ItemWithTemporalSources;
			name: string;
		}>[] = [
			{
				expectedAt: planAt,
				expectedSource: 'plan',
				item: temporalItem({
					availability: [openingHours],
					includePlacement: true,
					includePlan: true,
					includeService: true
				}),
				name: 'Plan controls ordering when every source is present'
			},
			{
				expectedAt: serviceAt,
				expectedSource: 'service',
				item: temporalItem({ includePlacement: true, includeService: true }),
				name: 'an unplanned transport uses its first scheduled service time on its displayed day'
			},
			{
				expectedAt: undefined,
				expectedSource: undefined,
				item: temporalItem({
					includePlacement: true,
					includeService: true,
					serviceTimestamp: Date.UTC(2026, 3, 14, 10)
				}),
				name: 'a service time outside the displayed day does not position a day-placed item'
			},
			{
				expectedAt: undefined,
				expectedSource: undefined,
				item: temporalItem({ availability: [openingHours], includePlacement: true }),
				name: 'opening-hours availability never reorders a day-only item'
			}
		];

		for (const scenario of cases) {
			it(scenario.name, () => {
				const source = resolveItemDayChronologicalPosition(scenario.item, day, tripTimeZone);
				expect(source?.source).toBe(scenario.expectedSource);
				expect(source?.at).toBe(scenario.expectedAt);
			});
		}
	});

	describe('Now / Next source matrix', () => {
		const cases: readonly Readonly<{
			expectedConstraintIds: readonly string[];
			expectedSources: readonly ('availability' | 'plan')[];
			item: ItemWithTemporalSources;
			name: string;
		}>[] = [
			{
				expectedConstraintIds: [],
				expectedSources: ['plan'],
				item: temporalItem({
					availability: [openingHours],
					includePlacement: true,
					includePlan: true,
					includeService: true
				}),
				name: 'Plan remains authoritative over availability and service'
			},
			{
				expectedConstraintIds: ['opening-hours'],
				expectedSources: ['availability'],
				item: temporalItem({ availability: [cutoff, receptionHours, openingHours], includePlacement: true }),
				name: 'only placed opening-hours availability is eligible'
			},
			{
				expectedConstraintIds: [],
				expectedSources: [],
				item: temporalItem({ includePlacement: true, includeService: true }),
				name: 'an unplanned transport service time is deliberately excluded'
			},
			{
				expectedConstraintIds: [],
				expectedSources: [],
				item: temporalItem({
					availability: [cutoff, receptionHours, storageHours, propertyCheckIn, propertyCheckOut],
					includePlacement: true
				}),
				name: 'deadlines, property times, and reception/storage hours are not events'
			}
		];

		for (const scenario of cases) {
			it(scenario.name, () => {
				const sources = resolveNowNextCandidateTemporalSources(scenario.item);
				expect(sources.map((source) => source.source)).toEqual(scenario.expectedSources);
				expect(sources.flatMap((source) => (source.source === 'availability' ? [source.constraint.id] : []))).toEqual(
					scenario.expectedConstraintIds
				);
			});
		}
	});

	describe('detail source matrix', () => {
		const cases: readonly Readonly<{
			expected: Readonly<{ availability: number; placement: boolean; plan: boolean; service: number }>;
			item: ItemWithTemporalSources;
			name: string;
		}>[] = [
			{
				expected: { availability: 1, placement: true, plan: true, service: 1 },
				item: temporalItem({
					availability: [openingHours],
					includePlacement: true,
					includePlan: true,
					includeService: true
				}),
				name: 'Plan, placement, service, and availability remain independent'
			},
			{
				expected: { availability: 1, placement: true, plan: false, service: 1 },
				item: temporalItem({ availability: [openingHours], includePlacement: true, includeService: true }),
				name: 'day-placed transport retains service and availability without a Plan'
			},
			{
				expected: { availability: 0, placement: false, plan: true, service: 0 },
				item: temporalItem({ includePlan: true }),
				name: 'Plan can be the only detail source'
			},
			{
				expected: { availability: 0, placement: true, plan: false, service: 0 },
				item: temporalItem({ includePlacement: true }),
				name: 'placement remains a separate day-only source'
			}
		];

		for (const scenario of cases) {
			it(scenario.name, () => {
				const sources = resolveItemDetailTemporalSources(scenario.item, tripTimeZone);
				expect({
					availability: sources.availability.length,
					placement: sources.placement !== undefined,
					plan: sources.plan !== undefined,
					service: sources.service.length
				}).toEqual(scenario.expected);
			});
		}

		it('keeps all source contexts when Plan and placement are both supplied to the detail policy', () => {
			const sources = resolveItemDetailTemporalSources(
				temporalItem({ availability: [openingHours], includePlacement: true, includePlan: true, includeService: true }),
				tripTimeZone
			);

			expect(sources.availabilityContextTimestamps).toEqual([planAt, planAt, placement.anchorAt]);
		});
	});
});
