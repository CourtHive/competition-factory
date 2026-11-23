import { POLICY_RANKING_POINTS_CTS } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_CTS';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

describe('ČTS Klasifikační řád 2025 policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_CTS);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('uses per-category pool model', () => {
    expect(policy.pointPoolModel).toEqual('per-category');
  });

  it('Article 21: best-of-8 singles + best-of-8 doubles', () => {
    const buckets = policy.aggregationRules.countingBuckets;
    expect(buckets.find((b: any) => b.bucketName === 'singles').bestOfCount).toEqual(8);
    expect(buckets.find((b: any) => b.bucketName === 'doubles').bestOfCount).toEqual(8);
  });

  it('Article 28: empty categoryAggregation (no cross-category rerate)', () => {
    expect(policy.aggregationRules.categoryAggregation).toEqual([]);
  });

  it('Article 2: U16 derived from U18 (ageRange max 16)', () => {
    expect(policy.derivedRankings).toHaveLength(1);
    const [derived] = policy.derivedRankings;
    expect(derived.category.ageCategoryCodes).toEqual(['U16']);
    expect(derived.derivedFrom.ageCategoryCodes).toEqual(['U18']);
    expect(derived.filter.ageRange).toEqual({ max: 16 });
  });
});
