import { POLICY_RANKING_POINTS_TENNIS_EUROPE } from '@Fixtures/policies/POLICY_RANKING_POINTS_TENNIS_EUROPE';
import { validateRankingPolicy } from './validatePolicy';
import { describe, expect, it } from 'vitest';

describe('Tennis Europe 2026 policy encoding', () => {
  const { policy, valid, errorsText } = validateRankingPolicy(POLICY_RANKING_POINTS_TENNIS_EUROPE);

  it('validates against rankingPolicy.schema.json', () => {
    if (!valid) console.error(errorsText);
    expect(valid).toEqual(true);
  });

  it('has 2026 metadata and per-category pool model', () => {
    expect(policy.policyName).toEqual('Tennis Europe Junior Tour 2026');
    expect(policy.validDateRange).toEqual({ startDate: '2026-01-01' });
    expect(policy.pointPoolModel).toEqual('per-category');
  });

  it('uses singles best-6 + doubles best-2 counting buckets', () => {
    const buckets = policy.aggregationRules.countingBuckets;
    const singles = buckets.find((b: any) => b.bucketName === 'singles');
    const doubles = buckets.find((b: any) => b.bucketName === 'doubles');
    expect(singles).toBeDefined();
    expect(singles.bestOfCount).toEqual(6);
    expect(doubles).toBeDefined();
    expect(doubles.bestOfCount).toEqual(2);
  });

  it('encodes 16&U → 14&U cap (max 2 of 6 singles) and 14&U → 16&U no-cap carry', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    const sixteenToFourteen = rules.find(
      (r: any) => r.source.ageCategoryCodes?.[0] === '16U' && r.target.ageCategoryCodes?.[0] === '14U',
    );
    expect(sixteenToFourteen).toBeDefined();
    expect(sixteenToFourteen.multiplier).toEqual(1.0);
    expect(sixteenToFourteen.maxCarriedResults).toEqual(2);
    expect(sixteenToFourteen.subjectToBucketLimits).toEqual(true);

    const fourteenToSixteen = rules.find(
      (r: any) =>
        r.source.ageCategoryCodes?.[0] === '14U' && r.target.ageCategoryCodes?.[0] === '16U' && !r.source.categoryNames,
    );
    expect(fourteenToSixteen).toBeDefined();
    expect(fourteenToSixteen.multiplier).toEqual(1.0);
    expect(fourteenToSixteen.maxCarriedResults).toBeUndefined();
  });

  it('encodes 12U starting-points → 14U carry sourced from STARTING_POINTS categoryName', () => {
    const rules = policy.aggregationRules.categoryAggregation;
    const startingPoints = rules.find((r: any) => r.source.categoryNames?.includes('STARTING_POINTS'));
    expect(startingPoints).toBeDefined();
    expect(startingPoints.source.ageCategoryCodes).toEqual(['12U']);
    expect(startingPoints.target.ageCategoryCodes).toEqual(['14U']);
    expect(startingPoints.multiplier).toEqual(1.0);
  });

  it('exposes 12U starting-points award profiles by name for emission-time rerate', () => {
    const profileNames = policy.awardProfiles.map((p: any) => p.profileName);
    expect(profileNames).toContain('TE 12 Cat 1 starting points');
    expect(profileNames).toContain('TE 12 Cat 2 starting points');
  });

  it('14U Super winner = 180 (numeric ground truth)', () => {
    const super14U = policy.awardProfiles.find((p: any) => p.profileName === 'TE 14&U Super');
    expect(super14U).toBeDefined();
    expect(super14U.finishingPositionRanges[1]).toEqual(180);
  });

  it('16U Super winner = 360 (200% of 14U base; numeric ground truth)', () => {
    const super16U = policy.awardProfiles.find((p: any) => p.profileName === 'TE 16&U Super');
    expect(super16U).toBeDefined();
    expect(super16U.finishingPositionRanges[1]).toEqual(360);
  });

  it('12U Cat 1 starting-points Winner = 25 and Cat 2 Winner = 15', () => {
    const cat1 = policy.awardProfiles.find((p: any) => p.profileName === 'TE 12 Cat 1 starting points');
    const cat2 = policy.awardProfiles.find((p: any) => p.profileName === 'TE 12 Cat 2 starting points');
    expect(cat1.finishingPositionRanges[1]).toEqual(25);
    expect(cat2.finishingPositionRanges[1]).toEqual(15);
  });
});
