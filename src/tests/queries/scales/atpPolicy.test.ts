import { POLICY_RANKING_POINTS_ATP } from '@Fixtures/policies/POLICY_RANKING_POINTS_ATP';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { MAIN, QUALIFYING, ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const policyDefinitions = POLICY_RANKING_POINTS_ATP;
const policy = policyDefinitions[POLICY_TYPE_RANKING_POINTS];

describe('ATP 2026 Policy Structure', () => {
  it('has correct policy metadata', () => {
    expect(policy.policyName).toEqual('PIF ATP Rankings 2026');
    expect(policy.policyVersion).toEqual('2026.01');
    expect(policy.validDateRange.startDate).toEqual('2026-01-01');
    expect(policy.doublesAttribution).toEqual('fullToEach');
  });

  it('has all 15 award profiles', () => {
    expect(policy.awardProfiles.length).toEqual(15);
    const profileNames = policy.awardProfiles.map((p) => p.profileName);
    expect(profileNames).toContain('Grand Slam Singles');
    expect(profileNames).toContain('Grand Slam Doubles');
    expect(profileNames).toContain('Grand Slam Qualifying Singles');
    expect(profileNames).toContain('ATP Finals Singles');
    expect(profileNames).toContain('ATP Finals Doubles');
    expect(profileNames).toContain('ATP 1000 Singles');
    expect(profileNames).toContain('ATP 1000 Doubles');
    expect(profileNames).toContain('ATP 500 Singles');
    expect(profileNames).toContain('ATP 500 Doubles');
    expect(profileNames).toContain('ATP 250 Singles');
    expect(profileNames).toContain('ATP 250 Doubles');
    expect(profileNames).toContain('Qualifying Singles');
    expect(profileNames).toContain('Challenger & ITF Singles');
    expect(profileNames).toContain('Challenger & ITF Doubles');
    expect(profileNames).toContain('United Cup');
  });

  it('has correct aggregation rules', () => {
    const { aggregationRules } = policy;
    expect(aggregationRules.rollingPeriodDays).toEqual(364);
    expect(aggregationRules.separateByGender).toEqual(false);
    expect(aggregationRules.perCategory).toEqual(false);
    expect(aggregationRules.countingBuckets.length).toEqual(2);

    const singles = aggregationRules.countingBuckets[0];
    expect(singles.bucketName).toEqual('Singles');
    expect(singles.bestOfCount).toEqual(19);
    expect(singles.eventTypes).toEqual([SINGLES]);
    expect(singles.mandatoryRules.length).toEqual(2);
    expect(singles.mandatoryRules[0].ruleName).toEqual('Grand Slams');
    expect(singles.mandatoryRules[1].ruleName).toEqual('ATP 1000');

    const doubles = aggregationRules.countingBuckets[1];
    expect(doubles.bucketName).toEqual('Doubles');
    expect(doubles.bestOfCount).toEqual(18);
    expect(doubles.eventTypes).toEqual([DOUBLES]);
  });
});

describe('ATP 2026 Profile Selection', () => {
  it('selects Grand Slam Singles for level 1 MAIN singles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('Grand Slam Singles');
  });

  it('selects Grand Slam Qualifying Singles for level 1 QUALIFYING singles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('Grand Slam Qualifying Singles');
  });

  it('selects ATP Finals Singles for level 2 RR with playoff', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 2,
    });
    expect(awardProfile?.profileName).toEqual('ATP Finals Singles');
  });

  it('selects ATP Finals Doubles for level 2 RR with playoff doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 2,
    });
    expect(awardProfile?.profileName).toEqual('ATP Finals Doubles');
  });

  it('selects ATP 1000 Singles for level 3', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('ATP 1000 Singles');
  });

  it('selects ATP 1000 Singles for level 4', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 4,
    });
    expect(awardProfile?.profileName).toEqual('ATP 1000 Singles');
  });

  it('selects ATP 500 Singles for level 5', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 5,
    });
    expect(awardProfile?.profileName).toEqual('ATP 500 Singles');
  });

  it('selects ATP 250 Singles for level 7', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 7,
    });
    expect(awardProfile?.profileName).toEqual('ATP 250 Singles');
  });

  it('selects Qualifying Singles for level 5 QUALIFYING', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 5,
    });
    expect(awardProfile?.profileName).toEqual('Qualifying Singles');
  });

  it('selects Challenger & ITF Singles for level 9', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 9,
    });
    expect(awardProfile?.profileName).toEqual('Challenger & ITF Singles');
  });

  it('selects Challenger & ITF Doubles for level 12', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 12,
    });
    expect(awardProfile?.profileName).toEqual('Challenger & ITF Doubles');
  });

  it('selects Grand Slam Doubles for level 1 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('Grand Slam Doubles');
  });

  it('selects ATP 1000 Doubles for level 3 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('ATP 1000 Doubles');
  });

  it('selects ATP 500 Doubles for level 6 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 6,
    });
    expect(awardProfile?.profileName).toEqual('ATP 500 Doubles');
  });

  it('selects ATP 250 Doubles for level 8 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 8,
    });
    expect(awardProfile?.profileName).toEqual('ATP 250 Doubles');
  });

  it('selects United Cup for TEAM_EVENT', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: TEAM_EVENT,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('United Cup');
  });
});

describe('ATP 2026 Ranking Points Values', () => {
  it('Grand Slam Singles champion gets 2000 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(2000);
    expect(awardProfile.finishingPositionRanges[2]).toEqual(1300);
    expect(awardProfile.finishingPositionRanges[128]).toEqual(10);
  });

  it('ATP 1000 level-keyed values resolve correctly', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 3,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(1000);
    // R64 is level-keyed: level 3 = 30, level 4 = 10
    expect(awardProfile.finishingPositionRanges[64]).toEqual({ level: { 3: 30, 4: 10 } });
    // R128 only for level 3
    expect(awardProfile.finishingPositionRanges[128]).toEqual({ level: { 3: 10 } });
  });

  it('Challenger singles values are level-keyed', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 9,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual({ level: { 9: 175, 10: 125, 11: 100, 12: 75, 13: 50, 14: 25, 15: 15 } });
  });

  it('Qualifying singles values are level-keyed', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 5,
    });
    // Position 1 (qualifier) at level 5 = 16
    expect(awardProfile.finishingPositionRanges[1]).toEqual({
      level: { 3: 20, 4: 30, 5: 16, 6: 25, 7: 8, 8: 13, 9: 6, 10: 5, 11: 4, 12: 4, 13: 3 },
    });
  });

  it('ATP Finals has perWinPoints for RR stage', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: ROUND_ROBIN_WITH_PLAYOFF,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 2,
    });
    expect(awardProfile.perWinPoints.value).toEqual(200);
    expect(awardProfile.perWinPoints.participationOrders).toEqual([1]);
    expect(awardProfile.finishingPositionRanges[1]).toEqual(900);
    expect(awardProfile.finishingPositionRanges[2]).toEqual(400);
  });

  it('Grand Slam Doubles champion gets 2000 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(2000);
    expect(awardProfile.finishingPositionRanges[2]).toEqual(1200);
  });

  it('ATP 250 Doubles R16 is level-keyed (L7 only)', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 7,
    });
    expect(awardProfile.finishingPositionRanges[16]).toEqual({ level: { 7: 20 } });
  });
});

describe('ATP 2026 Point Calculation', () => {
  it('computes correct points for a single elimination draw at level 1', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 1 });
    expect(result.success).toEqual(true);
    expect(Object.keys(result.personPoints).length).toBeGreaterThan(0);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    // Champion at GS gets 2000
    expect(maxPoints).toEqual(2000);
  });

  it('computes correct points for Challenger 175 (level 9)', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 9 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    // Challenger 175 champion = 175
    expect(maxPoints).toEqual(175);
  });

  it('computes correct points for ATP 500 (level 5)', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 5 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    expect(maxPoints).toEqual(500);
  });
});
