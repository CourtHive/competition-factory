import { POLICY_RANKING_POINTS_TENNIS_CANADA } from '@Fixtures/policies/POLICY_RANKING_POINTS_TENNIS_CANADA';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

describe('Tennis Canada policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_TENNIS_CANADA);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('uses shared pool model', () => {
    expect(policy.pointPoolModel).toEqual('shared');
  });

  it('has empty categoryAggregation under shared-pool paradigm', () => {
    expect(policy.aggregationRules.categoryAggregation).toEqual([]);
  });

  it('uses singles + doubles best-5 counting buckets, 365 day rolling period', () => {
    expect(policy.aggregationRules.rollingPeriodDays).toEqual(365);
    const buckets = policy.aggregationRules.countingBuckets;
    const singles = buckets.find((b: any) => b.bucketName === 'singles');
    const doubles = buckets.find((b: any) => b.bucketName === 'doubles');
    expect(singles.bestOfCount).toEqual(5);
    expect(doubles.bestOfCount).toEqual(5);
  });
});
