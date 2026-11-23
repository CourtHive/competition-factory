import { POLICY_RANKING_POINTS_TENNIS_AUSTRALIA } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_TENNIS_AUSTRALIA';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

describe('Tennis Australia (De Minaur Junior Tour) policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_TENNIS_AUSTRALIA);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('uses per-category pool model with singles + doubles best-8 buckets', () => {
    expect(policy.pointPoolModel).toEqual('per-category');
    const buckets = policy.aggregationRules.countingBuckets;
    expect(buckets.find((b: any) => b.bucketName === 'singles').bestOfCount).toEqual(8);
    expect(buckets.find((b: any) => b.bucketName === 'doubles').bestOfCount).toEqual(8);
  });

  it('caps non-12u → 12u and non-14u → 14u carries at 3 results with J1000 carve-out', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    const into12u = rules.find((r: any) => r.target.ageCategoryCodes?.[0] === '12U' && !r.source.ratingTypes);
    const into14u = rules.find((r: any) => r.target.ageCategoryCodes?.[0] === '14U' && !r.source.ratingTypes);

    [into12u, into14u].forEach((rule: any) => {
      expect(rule).toBeDefined();
      expect(rule.maxCarriedResults).toEqual(3);
      expect(rule.subjectToBucketLimits).toEqual(true);
      expect(rule.excludedSourceFilters).toEqual([{ levels: [1], ageEligibility: 'agingUpToTarget' }]);
    });
  });

  it('encodes J125 18u-rating dual carry into both 12u and 14u lists', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    const j125Rules = rules.filter((r: any) => r.source.ratingTypes?.includes('J125-RATED'));
    expect(j125Rules).toHaveLength(2);
    const targets = j125Rules.map((r: any) => r.target.ageCategoryCodes[0]).sort();
    expect(targets).toEqual(['12U', '14U']);
    j125Rules.forEach((rule: any) => {
      expect(rule.source.ageCategoryCodes).toEqual(['18U']);
      expect(rule.multiplier).toEqual(1.0);
    });
  });
});
