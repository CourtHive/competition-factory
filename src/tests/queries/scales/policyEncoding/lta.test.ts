import { POLICY_RANKING_POINTS_LTA } from '@Fixtures/policies/POLICY_RANKING_POINTS_LTA';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

describe('LTA Combined Rankings policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_LTA);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('uses per-category pool model', () => {
    expect(policy.pointPoolModel).toEqual('per-category');
  });

  it('encodes one Combined Ranking pool rule per age target (12U/14U/16U/18U)', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    expect(rules).toHaveLength(4);

    const targets = rules.map((r: any) => r.target.ageCategoryCodes[0]).sort();
    expect(targets).toEqual(['12U', '14U', '16U', '18U']);
  });

  it('each rule requires 3 native results, olderBy:2 window, 12-month retention, max 3 carried', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    rules.forEach((rule: any) => {
      expect(rule.multiplier).toEqual(1.0);
      expect(rule.minResultsFromTarget).toEqual(3);
      expect(rule.eligibleSourceWindow).toEqual({ olderBy: 2 });
      expect(rule.retentionMonthsAfterAging).toEqual(12);
      expect(rule.maxCarriedResults).toEqual(3);
      expect(rule.subjectToBucketLimits).toEqual(true);
    });
  });

  it('singles + doubles best-6 counting buckets present', () => {
    const buckets = policy.aggregationRules.countingBuckets;
    const singles = buckets.find((b: any) => b.bucketName === 'Singles');
    const doubles = buckets.find((b: any) => b.bucketName === 'Doubles');
    expect(singles.bestOfCount).toEqual(6);
    expect(doubles.bestOfCount).toEqual(6);
  });
});
