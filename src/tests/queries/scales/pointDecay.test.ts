import { applyPointDecay, getDecayFactor } from '@Query/scales/applyPointDecay';
import { generateRankingList } from '@Query/scales/generateRankingList';
import type { AggregationRules } from '@Types/rankingTypes';
import { describe, expect, it } from 'vitest';

// constants
import { LINEAR_DECAY, NO_DECAY, STEPPED_DECAY } from '@Constants/rankingConstants';
import { SINGLES } from '@Constants/eventConstants';

const AS_OF = '2026-01-01';

function makeAward(overrides: Record<string, any> = {}) {
  return {
    personId: 'p1',
    eventType: SINGLES,
    points: 100,
    positionPoints: 80,
    perWinPoints: 20,
    level: 3,
    endDate: AS_OF,
    ...overrides,
  };
}

describe('getDecayFactor', () => {
  it('is 1 with no decay function, NO_DECAY, or an age of zero', () => {
    expect(getDecayFactor(100, {})).toEqual(1);
    expect(getDecayFactor(100, { decayFunction: NO_DECAY })).toEqual(1);
    expect(getDecayFactor(0, { decayFunction: LINEAR_DECAY, rollingPeriodDays: 365 })).toEqual(1);
  });

  it('linear falls from 1 to 0 across the rolling window', () => {
    const rules = { decayFunction: LINEAR_DECAY, rollingPeriodDays: 100 } as const;
    expect(getDecayFactor(25, rules)).toEqual(0.75);
    expect(getDecayFactor(100, rules)).toEqual(0);
    expect(getDecayFactor(150, rules)).toEqual(0);
  });

  it('linear without a rolling window does not invent a slope', () => {
    expect(getDecayFactor(50, { decayFunction: LINEAR_DECAY })).toEqual(1);
  });

  it('stepped uses the largest step reached, in any declared order', () => {
    const rules: AggregationRules = {
      decayFunction: STEPPED_DECAY,
      decaySteps: [
        { afterDays: 270, multiplier: 0.25 },
        { afterDays: 180, multiplier: 0.5 },
      ],
    };
    expect(getDecayFactor(100, rules)).toEqual(1);
    expect(getDecayFactor(180, rules)).toEqual(0.5);
    expect(getDecayFactor(300, rules)).toEqual(0.25);
  });

  it('stepped with no steps is 1', () => {
    expect(getDecayFactor(300, { decayFunction: STEPPED_DECAY })).toEqual(1);
  });
});

describe('applyPointDecay', () => {
  it('scales every point component by the same factor and records it', () => {
    const [award] = applyPointDecay(
      [makeAward({ endDate: '2025-12-02', qualityWinPoints: 10, bonusPoints: 4, linePoints: 6 })],
      { decayFunction: LINEAR_DECAY, rollingPeriodDays: 120 },
      AS_OF,
    );
    // 30 days old in a 120-day window → 0.75
    expect(award.decayFactor).toEqual(0.75);
    expect(award.points).toEqual(75);
    expect(award.positionPoints).toEqual(60);
    expect(award.perWinPoints).toEqual(15);
    expect(award.qualityWinPoints).toEqual(7.5);
    expect(award.bonusPoints).toEqual(3);
    expect(award.linePoints).toEqual(4.5);
    expect(award.positionPoints + award.perWinPoints).toEqual(award.points);
  });

  it('does not mutate its input', () => {
    const input = makeAward({ endDate: '2025-12-02' });
    applyPointDecay([input], { decayFunction: LINEAR_DECAY, rollingPeriodDays: 120 }, AS_OF);
    expect(input.points).toEqual(100);
    expect((input as any).decayFactor).toBeUndefined();
  });

  it('leaves an award without an endDate, or a list without asOfDate, at full value', () => {
    const rules = { decayFunction: LINEAR_DECAY, rollingPeriodDays: 120 } as const;
    const undated = makeAward({ endDate: undefined });
    expect(applyPointDecay([undated], rules, AS_OF)[0]).toBe(undated);

    const dated = makeAward({ endDate: '2025-12-02' });
    expect(applyPointDecay([dated], rules, undefined)[0]).toBe(dated);
    expect(applyPointDecay([dated], rules, 'not-a-date')[0]).toBe(dated);
    expect(applyPointDecay([makeAward({ endDate: 'not-a-date' })], rules, AS_OF)[0].points).toEqual(100);
  });
});

describe('generateRankingList — decay', () => {
  it('reorders a list: a recent smaller result outranks an old larger one', () => {
    const pointAwards = [
      makeAward({ personId: 'old', points: 100, positionPoints: 100, perWinPoints: 0, endDate: '2025-07-05' }),
      makeAward({ personId: 'recent', points: 80, positionPoints: 80, perWinPoints: 0, endDate: '2025-12-27' }),
    ];

    const undecayed = generateRankingList({
      pointAwards,
      aggregationRules: { rollingPeriodDays: 365 },
      asOfDate: AS_OF,
    });
    expect(undecayed.map((e) => e.personId)).toEqual(['old', 'recent']);

    const stepped = generateRankingList({
      pointAwards,
      aggregationRules: {
        rollingPeriodDays: 365,
        decayFunction: STEPPED_DECAY,
        decaySteps: [{ afterDays: 180, multiplier: 0.5 }],
      },
      asOfDate: AS_OF,
    });
    expect(stepped.map((e) => e.personId)).toEqual(['recent', 'old']);
    expect(stepped.find((e) => e.personId === 'old')?.totalPoints).toEqual(50);
    expect(stepped.find((e) => e.personId === 'recent')?.totalPoints).toEqual(80);
  });

  it('decays bucket totals coherently when buckets sum granular components', () => {
    const result = generateRankingList({
      pointAwards: [makeAward({ endDate: '2025-12-02' })],
      aggregationRules: {
        rollingPeriodDays: 120,
        decayFunction: LINEAR_DECAY,
        countingBuckets: [{ bucketName: 'Singles', pointComponents: ['positionPoints', 'perWinPoints'] }],
      },
      asOfDate: AS_OF,
    });
    expect(result[0].totalPoints).toEqual(75);
    expect(result[0].bucketTotals).toEqual({ Singles: 75 });
  });

  it('decays carried contributions by their own age', () => {
    const result = generateRankingList({
      pointAwards: [
        makeAward({ personId: 'p1', category: { ageCategoryCode: 'U16' }, endDate: AS_OF }),
        makeAward({
          personId: 'p1',
          points: 200,
          positionPoints: 200,
          perWinPoints: 0,
          category: { ageCategoryCode: 'U14' },
          endDate: '2025-06-01',
        }),
      ],
      categoryFilter: { ageCategoryCodes: ['U16'] },
      aggregationRules: {
        rollingPeriodDays: 365,
        decayFunction: STEPPED_DECAY,
        decaySteps: [{ afterDays: 180, multiplier: 0.5 }],
        countingBuckets: [{ bucketName: 'all', pointComponents: ['positionPoints', 'perWinPoints'] }],
        categoryAggregation: [
          {
            ruleName: 'U14 → U16',
            source: { ageCategoryCodes: ['U14'] },
            target: { ageCategoryCodes: ['U16'] },
            multiplier: 0.2,
          },
        ],
      },
      asOfDate: AS_OF,
    });
    // native 100 (fresh) + carried 200 × 0.2 = 40, then × 0.5 decay = 20
    expect(result[0].totalPoints).toEqual(120);
  });
});
