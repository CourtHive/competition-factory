import { generateRankingList } from '@Query/scales/generateRankingList';
import { describe, expect, it } from 'vitest';

import type { CategoryAggregationRule, PointPoolModel } from '@Types/rankingTypes';

type Award = Record<string, any>;

const mkAward = (overrides: Partial<Award>): Award => ({
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

describe('generateRankingList — crossCategory', () => {
  it('USTA 20% downward carry: 14U list receives 20% of 12U points', () => {
    const pointAwards = [
      mkAward({
        personId: 'p1',
        drawId: '12u-a',
        category: { ageCategoryCode: '12U' },
        points: 1000,
        positionPoints: 1000,
      }),
      mkAward({
        personId: 'p1',
        drawId: '14u-a',
        category: { ageCategoryCode: '14U' },
        points: 500,
        positionPoints: 500,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: '12U → 14U (20%)',
        source: { ageCategoryCodes: ['12U'] },
        target: { ageCategoryCodes: ['14U'] },
        multiplier: 0.2,
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: rules },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    expect(result).toHaveLength(1);
    // 14U native (500) + carried 12U at 20% (200) = 700
    expect(result[0].totalPoints).toEqual(700);
  });

  it('TE max-2-of-6 cap: only top 2 of 3 carried 16U results contribute to 14U bucket', () => {
    const pointAwards = [
      // 14U native
      mkAward({
        personId: 'p1',
        drawId: '14u-a',
        category: { ageCategoryCode: '14U' },
        points: 50,
        positionPoints: 50,
      }),
      // 16U sources
      mkAward({
        personId: 'p1',
        drawId: '16u-a',
        category: { ageCategoryCode: '16U' },
        points: 200,
        positionPoints: 200,
      }),
      mkAward({
        personId: 'p1',
        drawId: '16u-b',
        category: { ageCategoryCode: '16U' },
        points: 150,
        positionPoints: 150,
      }),
      mkAward({
        personId: 'p1',
        drawId: '16u-c',
        category: { ageCategoryCode: '16U' },
        points: 100,
        positionPoints: 100,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: '16U → 14U (max 2)',
        source: { ageCategoryCodes: ['16U'] },
        target: { ageCategoryCodes: ['14U'] },
        multiplier: 1.0,
        maxCarriedResults: 2,
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: {
        categoryAggregation: rules,
        countingBuckets: [{ bucketName: 'singles', pointComponents: ['positionPoints'], bestOfCount: 6 }],
      },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    expect(result).toHaveLength(1);
    // native 50 + top 2 carried (200 + 150) = 400. The 100 is capped out.
    expect(result[0].totalPoints).toEqual(400);
  });

  it('USTA participation gate: player without native 14U award absent from 14U list', () => {
    const pointAwards = [
      mkAward({
        personId: 'p1',
        drawId: '16u-a',
        category: { ageCategoryCode: '16U' },
        points: 500,
        positionPoints: 500,
      }),
      // No 14U native award for p1.
      mkAward({
        personId: 'p2',
        drawId: '14u-a',
        category: { ageCategoryCode: '14U' },
        points: 100,
        positionPoints: 100,
      }),
      mkAward({
        personId: 'p2',
        drawId: '16u-a',
        category: { ageCategoryCode: '16U' },
        points: 600,
        positionPoints: 600,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: '16U play-up → 14U',
        source: { ageCategoryCodes: ['16U'] },
        target: { ageCategoryCodes: ['14U'] },
        multiplier: 1.0,
        requireParticipationInTarget: true,
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: rules },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    // p1 has no native 14U → absent. p2 has native + carried → present.
    expect(result.map((r) => r.personId)).toEqual(['p2']);
    // p2: 100 native + 600 carried at 1.0 = 700
    expect(result[0].totalPoints).toEqual(700);
  });

  it('LTA participation floor: minResultsFromTarget = 3 drops players with < 3 native', () => {
    const pointAwards = [
      // p1: 2 native (below floor), 3 carried
      mkAward({
        personId: 'p1',
        drawId: '12u-a',
        category: { ageCategoryCode: '12U' },
        points: 100,
        positionPoints: 100,
      }),
      mkAward({
        personId: 'p1',
        drawId: '12u-b',
        category: { ageCategoryCode: '12U' },
        points: 80,
        positionPoints: 80,
      }),
      mkAward({
        personId: 'p1',
        drawId: '14u-a',
        category: { ageCategoryCode: '14U' },
        points: 50,
        positionPoints: 50,
      }),
      mkAward({
        personId: 'p1',
        drawId: '14u-b',
        category: { ageCategoryCode: '14U' },
        points: 60,
        positionPoints: 60,
      }),
      mkAward({
        personId: 'p1',
        drawId: '14u-c',
        category: { ageCategoryCode: '14U' },
        points: 70,
        positionPoints: 70,
      }),
      // p2: 3 native, 0 carried
      mkAward({
        personId: 'p2',
        drawId: '12u-a',
        category: { ageCategoryCode: '12U' },
        points: 40,
        positionPoints: 40,
      }),
      mkAward({
        personId: 'p2',
        drawId: '12u-b',
        category: { ageCategoryCode: '12U' },
        points: 30,
        positionPoints: 30,
      }),
      mkAward({
        personId: 'p2',
        drawId: '12u-c',
        category: { ageCategoryCode: '12U' },
        points: 20,
        positionPoints: 20,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: '12U Combined Ranking pool',
        source: { ageCategoryCodes: ['12U', '14U'] },
        target: { ageCategoryCodes: ['12U'] },
        multiplier: 1.0,
        minResultsFromTarget: 3,
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: rules },
      categoryFilter: { ageCategoryCodes: ['12U'] },
    });

    // p1 has 2 native (below 3) → absent. p2 has 3 → present.
    expect(result.map((r) => r.personId)).toEqual(['p2']);
  });

  it('excluded source filter: J1000 level results excluded for player aging up', () => {
    const pointAwards = [
      mkAward({
        personId: 'p1',
        drawId: '14u-a',
        category: { ageCategoryCode: '14U' },
        points: 100,
        positionPoints: 100,
        level: 5,
      }),
      mkAward({
        personId: 'p1',
        drawId: '14u-j1000',
        category: { ageCategoryCode: '14U' },
        points: 1000,
        positionPoints: 1000,
        level: 1,
      }),
      mkAward({
        personId: 'p1',
        drawId: '16u-a',
        category: { ageCategoryCode: '16U' },
        points: 50,
        positionPoints: 50,
        level: 3,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: '14U → 16U (excl. J1000)',
        source: { ageCategoryCodes: ['14U'] },
        target: { ageCategoryCodes: ['16U'] },
        multiplier: 1.0,
        excludedSourceFilters: [{ levels: [1] }],
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: rules },
      categoryFilter: { ageCategoryCodes: ['16U'] },
    });

    expect(result).toHaveLength(1);
    // 16U native 50 + carried only the level-5 14U (100); the level-1 J1000 is excluded.
    expect(result[0].totalPoints).toEqual(150);
  });

  it('cross-target duplication: one source rule per target — result counts in both', () => {
    const pointAwards = [
      mkAward({
        personId: 'p1',
        drawId: '18u-j125',
        category: { ageCategoryCode: '18U', ratingType: 'J125-RATED' },
        points: 500,
        positionPoints: 500,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: 'J125 18U → 12U',
        source: { ageCategoryCodes: ['18U'], ratingTypes: ['J125-RATED'] },
        target: { ageCategoryCodes: ['12U'] },
        multiplier: 1.0,
        requireParticipationInTarget: false,
      },
      {
        ruleName: 'J125 18U → 14U',
        source: { ageCategoryCodes: ['18U'], ratingTypes: ['J125-RATED'] },
        target: { ageCategoryCodes: ['14U'] },
        multiplier: 1.0,
        requireParticipationInTarget: false,
      },
    ];

    const r12 = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: rules },
      categoryFilter: { ageCategoryCodes: ['12U'] },
    });
    const r14 = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: rules },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    expect(r12).toHaveLength(1);
    expect(r12[0].totalPoints).toEqual(500);
    expect(r14).toHaveLength(1);
    expect(r14[0].totalPoints).toEqual(500);
  });

  it('shared-pool fast path: same N best feeds each age-eligible list, no categoryAggregation', () => {
    const pointAwards = [
      mkAward({ personId: 'p1', drawId: 'a', category: { ageCategoryCode: '12U' }, points: 100, positionPoints: 100 }),
      mkAward({ personId: 'p1', drawId: 'b', category: { ageCategoryCode: '14U' }, points: 80, positionPoints: 80 }),
      mkAward({ personId: 'p1', drawId: 'c', category: { ageCategoryCode: '16U' }, points: 60, positionPoints: 60 }),
    ];

    // Tennis Canada-style: no rules, age-eligible filter via categoryFilter at call site.
    const aggregationRules = {
      countingBuckets: [{ bucketName: 'singles', pointComponents: ['positionPoints'], bestOfCount: 5 }],
    };
    const pointPoolModel: PointPoolModel = 'shared';

    // For the 14U list, only 14U-tagged awards match the filter — but the shared
    // pool model means the consumer normally relaxes the categoryFilter to
    // age-eligibility. To prove fast-path skips categoryAggregation, we pass
    // a permissive filter and confirm no carry math happens.
    const result = generateRankingList({
      pointAwards,
      aggregationRules,
      pointPoolModel,
    });

    expect(result).toHaveLength(1);
    // All 3 awards count (within bestOfCount=5).
    expect(result[0].totalPoints).toEqual(240);
  });

  it('strict per-category (ČTS): zero rules => no cross-category carry', () => {
    const pointAwards = [
      mkAward({
        personId: 'p1',
        drawId: 'u14',
        category: { ageCategoryCode: '14U' },
        points: 500,
        positionPoints: 500,
      }),
      mkAward({
        personId: 'p1',
        drawId: 'u16',
        category: { ageCategoryCode: '16U' },
        points: 1000,
        positionPoints: 1000,
      }),
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: { categoryAggregation: [] },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    expect(result).toHaveLength(1);
    // Only native 14U counts; the 16U 1000 doesn't carry.
    expect(result[0].totalPoints).toEqual(500);
  });

  it('subjectToBucketLimits: false — carried adds on top of bestOfCount instead of competing', () => {
    const pointAwards = [
      // 6 native 14U awards (fills the best-6 bucket)
      ...Array.from({ length: 6 }, (_, i) =>
        mkAward({
          personId: 'p1',
          drawId: `14u-${i}`,
          category: { ageCategoryCode: '14U' },
          points: 100,
          positionPoints: 100,
        }),
      ),
      // 1 carried 12U award
      mkAward({
        personId: 'p1',
        drawId: '12u-extra',
        category: { ageCategoryCode: '12U' },
        points: 50,
        positionPoints: 50,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: '12U → 14U (additive)',
        source: { ageCategoryCodes: ['12U'] },
        target: { ageCategoryCodes: ['14U'] },
        multiplier: 1.0,
        subjectToBucketLimits: false,
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: {
        categoryAggregation: rules,
        countingBuckets: [{ bucketName: 'singles', pointComponents: ['positionPoints'], bestOfCount: 6 }],
      },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    expect(result).toHaveLength(1);
    // Native 6 × 100 = 600, plus additive carried 50 = 650.
    expect(result[0].totalPoints).toEqual(650);
  });

  it('carryComponents: only specified components are carried', () => {
    const pointAwards = [
      mkAward({
        personId: 'p1',
        drawId: '12u-a',
        category: { ageCategoryCode: '12U' },
        points: 200,
        positionPoints: 100,
        perWinPoints: 50,
        qualityWinPoints: 50, // should be zeroed when not in carryComponents
      }),
      mkAward({
        personId: 'p1',
        drawId: '14u-a',
        category: { ageCategoryCode: '14U' },
        points: 0,
        positionPoints: 0,
        perWinPoints: 0,
      }),
    ];

    const rules: CategoryAggregationRule[] = [
      {
        ruleName: 'carry only position+perWin',
        source: { ageCategoryCodes: ['12U'] },
        target: { ageCategoryCodes: ['14U'] },
        multiplier: 1.0,
        carryComponents: ['positionPoints', 'perWinPoints'],
      },
    ];

    const result = generateRankingList({
      pointAwards,
      aggregationRules: {
        categoryAggregation: rules,
        countingBuckets: [
          {
            bucketName: 'singles',
            pointComponents: ['positionPoints', 'perWinPoints', 'qualityWinPoints'],
            bestOfCount: 6,
          },
        ],
      },
      categoryFilter: { ageCategoryCodes: ['14U'] },
    });

    expect(result).toHaveLength(1);
    // Position 100 + perWin 50 = 150. qualityWin not carried.
    expect(result[0].totalPoints).toEqual(150);
  });
});
