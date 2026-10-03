import { generateRankingList } from '@Query/scales/generateRankingList';
import { describe, expect, it } from 'vitest';

// types
import type { CategoryAggregationRule } from '@Types/rankingTypes';

/**
 * The CARRY path of `generateRankingList` — how a category-aggregation rule selects source awards,
 * windows them, and rebuilds them for the target list. `generateRankingList.crossCategory.test.ts`
 * covers age-category carries with a multiplier; this covers the other ways a rule's source is
 * scoped and excluded, the rolling window applied to carried awards, and what a carried award keeps.
 */

type Award = Record<string, any>;

const award = (overrides: Partial<Award>): Award => ({
  personId: 'p1',
  participantId: 'pi1',
  drawId: 'd1',
  eventType: 'SINGLES',
  category: { ageCategoryCode: '12U' },
  points: 100,
  positionPoints: 100,
  perWinPoints: 0,
  qualityWinPoints: 0,
  bonusPoints: 0,
  winCount: 1,
  rangeAccessor: 1,
  level: 1,
  endDate: '2026-05-01',
  ...overrides,
});

const carryTo14U = (overrides: Partial<CategoryAggregationRule> = {}): CategoryAggregationRule => ({
  ruleName: 'carry',
  source: { ageCategoryCodes: ['12U'] },
  target: { ageCategoryCodes: ['14U'] },
  ...overrides,
});

const list14U = (pointAwards: Award[], rule: CategoryAggregationRule, extra: Record<string, any> = {}) =>
  generateRankingList({
    pointAwards: pointAwards as any,
    aggregationRules: { categoryAggregation: [rule], ...extra },
    categoryFilter: { ageCategoryCodes: ['14U'] },
    asOfDate: extra.asOfDate,
  });

const pointsOf = (entries: any[], personId = 'p1') => entries.find((entry) => entry.personId === personId)?.totalPoints;

describe('generateRankingList — what a carry rule takes as its source', () => {
  it('carries at full value when the rule names no multiplier', () => {
    const entries = list14U([award({ points: 300, positionPoints: 300 })], carryTo14U());
    expect(pointsOf(entries)).toEqual(300);
  });

  it('applies the rolling window to carried awards as well as native ones', () => {
    const pointAwards = [
      award({ drawId: 'recent', points: 200, positionPoints: 200, endDate: '2026-09-01' }),
      award({ drawId: 'stale', points: 900, positionPoints: 900, endDate: '2025-01-01' }),
    ];
    const windowed = list14U(pointAwards, carryTo14U(), { rollingPeriodDays: 365, asOfDate: '2026-10-01' });
    expect(pointsOf(windowed)).toEqual(200);

    // CONTROL: without the window both count
    expect(pointsOf(list14U(pointAwards, carryTo14U()))).toEqual(1100);
  });

  it('scopes the source by gender, read from the category or the award', () => {
    const pointAwards = [
      award({ personId: 'girl', category: { ageCategoryCode: '12U', gender: 'FEMALE' }, points: 100 }),
      award({ personId: 'boy', gender: 'MALE', points: 100 }),
      award({ personId: 'unknown', points: 100 }),
    ];
    const entries = list14U(pointAwards, carryTo14U({ source: { ageCategoryCodes: ['12U'], genders: ['FEMALE'] } }));
    expect(entries.map((entry: any) => entry.personId)).toEqual(['girl']);
  });

  it('scopes the source by category name and by rating type', () => {
    const pointAwards = [
      award({ personId: 'named', category: { ageCategoryCode: '12U', categoryName: 'Open', ratingType: 'WTN' } }),
      award({ personId: 'otherName', category: { ageCategoryCode: '12U', categoryName: 'Novice', ratingType: 'WTN' } }),
      award({ personId: 'noName', category: { ageCategoryCode: '12U', ratingType: 'WTN' } }),
      award({ personId: 'otherRating', category: { ageCategoryCode: '12U', categoryName: 'Open', ratingType: 'UTR' } }),
      award({ personId: 'noRating', category: { ageCategoryCode: '12U', categoryName: 'Open' } }),
    ];
    const byName = list14U(pointAwards, carryTo14U({ source: { categoryNames: ['Open'] } }));
    expect(byName.map((entry: any) => entry.personId).sort((a, b) => a.localeCompare(b))).toEqual([
      'named',
      'noRating',
      'otherRating',
    ]);

    const byRating = list14U(pointAwards, carryTo14U({ source: { ratingTypes: ['WTN'] } }));
    expect(byRating.map((entry: any) => entry.personId).sort((a, b) => a.localeCompare(b))).toEqual([
      'named',
      'noName',
      'otherName',
    ]);
  });

  it('excludes source awards by draw type and by event tier, and keeps those the filter does not name', () => {
    const pointAwards = [
      award({ personId: 'consolation', drawType: 'FEED_IN', points: 100 }),
      award({ personId: 'tier', eventTier: 'LOCAL', points: 100 }),
      award({ personId: 'kept', drawType: 'SINGLE_ELIMINATION', eventTier: 'NATIONAL', points: 100 }),
    ];
    const entries = list14U(
      pointAwards,
      carryTo14U({ excludedSourceFilters: [{ drawTypes: ['FEED_IN'] }, { eventTiers: ['LOCAL'] }] as any }),
    );
    expect(entries.map((entry: any) => entry.personId)).toEqual(['kept']);
  });

  it('skips a source award that names no person', () => {
    const entries = list14U([award({ personId: undefined, points: 500 }), award({ points: 50 })], carryTo14U());
    expect(entries).toHaveLength(1);
    expect(pointsOf(entries)).toEqual(50);
  });
});

describe('generateRankingList — which target lists a carry rule feeds', () => {
  it('feeds a list whose gender filter overlaps the target, and no other', () => {
    const rule = carryTo14U({ target: { ageCategoryCodes: ['14U'], genders: ['FEMALE'] } });
    const pointAwards = [award({ category: { ageCategoryCode: '12U', gender: 'FEMALE' }, points: 100 })];

    const female = generateRankingList({
      categoryFilter: { ageCategoryCodes: ['14U'], genders: ['FEMALE'] },
      aggregationRules: { categoryAggregation: [rule] },
      pointAwards: pointAwards as any,
    });
    expect(pointsOf(female)).toEqual(100);

    const male = generateRankingList({
      categoryFilter: { ageCategoryCodes: ['14U'], genders: ['MALE'] },
      aggregationRules: { categoryAggregation: [rule] },
      pointAwards: pointAwards as any,
    });
    expect(male).toEqual([]);
  });

  it('feeds every list when there is no category filter', () => {
    const entries = generateRankingList({
      aggregationRules: { categoryAggregation: [carryTo14U({ multiplier: 0.5 })] },
      pointAwards: [award({ points: 100 })] as any,
    });
    // the native award counts in full, and the rule carries half of it onto the same unfiltered list
    expect(pointsOf(entries)).toEqual(150);
  });
});

describe('generateRankingList — what a carried award keeps', () => {
  it('keeps only the components the rule carries, scaled, and scales line points too', () => {
    const source = award({
      points: 200,
      positionPoints: 100,
      perWinPoints: 60,
      qualityWinPoints: 40,
      bonusPoints: 0,
      linePoints: 30,
    });
    const [entry]: any[] = list14U(
      [source],
      carryTo14U({ multiplier: 0.5, carryComponents: ['positionPoints', 'perWinPoints'] }),
    );
    expect(entry.totalPoints).toEqual(100);
    // CONTROL: the one counted result is the carried one
    expect(entry.countingResults).toHaveLength(1);
    const [carried] = entry.countingResults;
    expect(carried.carriedFromRule).toEqual('carry');
    expect(carried.positionPoints).toEqual(50);
    expect(carried.perWinPoints).toEqual(30);
    expect(carried.qualityWinPoints).toEqual(0);
    expect(carried.linePoints).toEqual(15);
  });

  it('carries at most maxCarriedResults per person, the best first', () => {
    const pointAwards = [
      award({ drawId: 'a', points: 100, positionPoints: 100 }),
      award({ drawId: 'b', points: 300, positionPoints: 300 }),
      award({ drawId: 'c', points: 200, positionPoints: 200 }),
    ];
    const entries = list14U(pointAwards, carryTo14U({ maxCarriedResults: 2 }));
    expect(pointsOf(entries)).toEqual(500);
  });
});
