import { applyEligibleSourceWindow, getAgeCategoryOrder } from '@Query/scales/eligibleSourceWindow';
import { POLICY_RANKING_POINTS_LTA } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_LTA';
import { generateRankingList } from '@Query/scales/generateRankingList';
import type { RankingListWarning } from '@Types/rankingTypes';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { UNORDERABLE_AGE_CATEGORY } from '@Constants/rankingConstants';
import { SINGLES } from '@Constants/eventConstants';

const AS_OF = '2026-01-01';

function makeAward(ageCategoryCode: string | undefined, points: number, personId = 'p1') {
  return {
    personId,
    eventType: SINGLES,
    points,
    positionPoints: points,
    level: 3,
    endDate: '2025-10-01',
    category: { ageCategoryCode },
  };
}

const ltaRules: any = POLICY_RANKING_POINTS_LTA[POLICY_TYPE_RANKING_POINTS].aggregationRules;
const lta12U = ltaRules.categoryAggregation.find((rule) => rule.ruleName === '12U Combined Ranking pool');

describe('getAgeCategoryOrder', () => {
  it('orders junior codes by their maximum age and refuses unbounded codes', () => {
    expect(getAgeCategoryOrder('12U')).toEqual(12);
    expect(getAgeCategoryOrder('16U')).toEqual(16);
    expect(getAgeCategoryOrder('U18')).toEqual(17);
    expect(getAgeCategoryOrder('OPEN')).toBeUndefined();
    expect(getAgeCategoryOrder('35O')).toBeUndefined();
    expect(getAgeCategoryOrder(undefined)).toBeUndefined();
  });
});

describe('applyEligibleSourceWindow', () => {
  const awards = ['12U', '14U', '16U', '18U'].map((code) => makeAward(code, 10));

  it('is a no-op when the rule declares no window', () => {
    const rule = { source: {}, target: { ageCategoryCodes: ['12U'] } };
    expect(applyEligibleSourceWindow({ awards, rule, targetCode: '12U' })).toBe(awards);
    expect(applyEligibleSourceWindow({ awards, rule: { ...rule, eligibleSourceWindow: {} }, targetCode: '12U' })).toBe(
      awards,
    );
  });

  it('counts the window in age groups, not years', () => {
    const rule = { source: {}, target: { ageCategoryCodes: ['12U'] }, eligibleSourceWindow: { olderBy: 2 } };
    const kept = applyEligibleSourceWindow({ awards, rule, targetCode: '12U' });
    expect(kept?.map((a) => a.category.ageCategoryCode)).toEqual(['12U', '14U', '16U']);
  });

  it('limits younger groups only when youngerBy is declared', () => {
    const olderOnly = { source: {}, target: { ageCategoryCodes: ['18U'] }, eligibleSourceWindow: { olderBy: 0 } };
    expect(applyEligibleSourceWindow({ awards, rule: olderOnly, targetCode: '18U' })?.length).toEqual(4);

    const younger = { source: {}, target: { ageCategoryCodes: ['18U'] }, eligibleSourceWindow: { youngerBy: 1 } };
    const kept = applyEligibleSourceWindow({ awards, rule: younger, targetCode: '18U' });
    expect(kept?.map((a) => a.category.ageCategoryCode)).toEqual(['16U', '18U']);
  });

  it('skips the rule and warns when the target cannot be ordered', () => {
    const warnings: RankingListWarning[] = [];
    const rule = {
      ruleName: 'open',
      source: {},
      target: { ageCategoryCodes: ['OPEN'] },
      eligibleSourceWindow: { olderBy: 1 },
    };
    const kept = applyEligibleSourceWindow({ awards, rule, targetCode: 'OPEN', onWarning: (w) => warnings.push(w) });
    expect(kept).toBeUndefined();
    expect(warnings).toEqual([
      expect.objectContaining({ code: UNORDERABLE_AGE_CATEGORY, ruleName: 'open', ageCategoryCode: 'OPEN' }),
    ]);
  });

  it('skips the rule and warns when a named source category cannot be ordered', () => {
    const warnings: RankingListWarning[] = [];
    const rule = {
      source: { ageCategoryCodes: ['14U', 'OPEN'] },
      target: { ageCategoryCodes: ['12U'] },
      eligibleSourceWindow: { olderBy: 1 },
    };
    expect(
      applyEligibleSourceWindow({ awards, rule, targetCode: '12U', onWarning: (w) => warnings.push(w) }),
    ).toBeUndefined();
    expect(warnings[0].ageCategoryCode).toEqual('OPEN');
  });

  it('excludes and reports an unorderable award under a category-less source scope', () => {
    const warnings: RankingListWarning[] = [];
    const rule = { source: {}, target: { ageCategoryCodes: ['12U'] }, eligibleSourceWindow: { olderBy: 1 } };
    const kept = applyEligibleSourceWindow({
      awards: [makeAward('14U', 10), makeAward('OPEN', 10)],
      onWarning: (w) => warnings.push(w),
      targetCode: '12U',
      rule,
    });
    expect(kept?.map((a) => a.category.ageCategoryCode)).toEqual(['14U']);
    expect(warnings.map((w) => w.ageCategoryCode)).toEqual(['OPEN']);
  });
});

describe('generateRankingList — eligibleSourceWindow', () => {
  it('the LTA 12U pool carries results from up to two age groups above, and no further', () => {
    // LTA names 12U/14U/16U as sources, which already sits inside { olderBy: 2 }.
    // Widen the source to 18U to show the window, not the source list, excludes it.
    const widened = { ...lta12U, source: { ageCategoryCodes: ['12U', '14U', '16U', '18U'] }, minResultsFromTarget: 0 };
    const pointAwards = [makeAward('16U', 40), makeAward('18U', 1000)];
    const warnings: RankingListWarning[] = [];

    const result = generateRankingList({
      aggregationRules: { categoryAggregation: [widened] },
      categoryFilter: { ageCategoryCodes: ['12U'] },
      onWarning: (w) => warnings.push(w),
      asOfDate: AS_OF,
      pointAwards,
    });

    expect(result[0].totalPoints).toEqual(40);
    expect(warnings).toEqual([]);

    const unwindowed = generateRankingList({
      aggregationRules: { categoryAggregation: [{ ...widened, eligibleSourceWindow: undefined }] },
      categoryFilter: { ageCategoryCodes: ['12U'] },
      asOfDate: AS_OF,
      pointAwards,
    });
    expect(unwindowed[0].totalPoints).toEqual(1040);
  });

  it('a rule whose window cannot be evaluated contributes nothing and is reported', () => {
    const warnings: RankingListWarning[] = [];
    const result = generateRankingList({
      aggregationRules: {
        categoryAggregation: [
          {
            ruleName: 'open pool',
            source: { ageCategoryCodes: ['18U'] },
            target: { ageCategoryCodes: ['OPEN'] },
            eligibleSourceWindow: { olderBy: 1 },
          },
        ],
      },
      pointAwards: [makeAward('18U', 50), makeAward('OPEN', 20)],
      categoryFilter: { ageCategoryCodes: ['OPEN'] },
      onWarning: (w) => warnings.push(w),
      asOfDate: AS_OF,
    });
    expect(result[0].totalPoints).toEqual(20);
    expect(warnings.map((w) => w.ruleName)).toEqual(['open pool']);
  });

  it('a target with several codes and no filter to choose between them cannot be ordered', () => {
    const warnings: RankingListWarning[] = [];
    generateRankingList({
      aggregationRules: {
        categoryAggregation: [
          {
            source: { ageCategoryCodes: ['16U'] },
            target: { ageCategoryCodes: ['12U', '14U'] },
            eligibleSourceWindow: { olderBy: 1 },
          },
        ],
      },
      pointAwards: [makeAward('16U', 50)],
      onWarning: (w) => warnings.push(w),
      asOfDate: AS_OF,
    });
    expect(warnings.map((w) => w.code)).toEqual([UNORDERABLE_AGE_CATEGORY]);
  });
});
