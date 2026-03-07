import { POLICY_RANKING_POINTS_WTA } from '@Fixtures/policies/POLICY_RANKING_POINTS_WTA';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const policyDefinitions = POLICY_RANKING_POINTS_WTA;
const policy = policyDefinitions[POLICY_TYPE_RANKING_POINTS];

describe('WTA 2026 Policy Structure', () => {
  it('has correct policy metadata', () => {
    expect(policy.policyName).toEqual('PIF WTA Rankings 2026');
    expect(policy.policyVersion).toEqual('2026.01');
    expect(policy.validDateRange.startDate).toEqual('2026-01-01');
    expect(policy.doublesAttribution).toEqual('fullToEach');
  });

  it('has all 15 award profiles', () => {
    expect(policy.awardProfiles.length).toEqual(15);
    const profileNames = policy.awardProfiles.map((p) => p.profileName);
    expect(profileNames).toContain('Grand Slam Singles');
    expect(profileNames).toContain('Grand Slam Doubles');
    expect(profileNames).toContain('Grand Slam Doubles Qualifying');
    expect(profileNames).toContain('WTA Finals Singles');
    expect(profileNames).toContain('WTA Finals Doubles');
    expect(profileNames).toContain('WTA 1000 Singles');
    expect(profileNames).toContain('WTA 1000 Doubles');
    expect(profileNames).toContain('WTA 500 Singles');
    expect(profileNames).toContain('WTA 500 Doubles');
    expect(profileNames).toContain('WTA 250 Singles');
    expect(profileNames).toContain('WTA 125 Singles');
    expect(profileNames).toContain('WTA Qualifying Singles');
    expect(profileNames).toContain('ITF Circuit Singles');
    expect(profileNames).toContain('WTA 250–ITF W35 Doubles');
    expect(profileNames).toContain('ITF W15 Doubles');
  });

  it('has correct aggregation rules', () => {
    const { aggregationRules } = policy;
    expect(aggregationRules.rollingPeriodDays).toEqual(364);
    expect(aggregationRules.separateByGender).toEqual(false);
    expect(aggregationRules.perCategory).toEqual(false);
    expect(aggregationRules.minCountableResults).toEqual(3);
    expect(aggregationRules.countingBuckets.length).toEqual(2);

    const singles = aggregationRules.countingBuckets[0];
    expect(singles.bucketName).toEqual('Singles');
    expect(singles.bestOfCount).toEqual(19);
    expect(singles.mandatoryRules.length).toEqual(2);
    expect(singles.mandatoryRules[0].ruleName).toEqual('Grand Slams');
    expect(singles.mandatoryRules[1].ruleName).toEqual('WTA 1000 Combined');
    expect(singles.mandatoryRules[1].bestOfCount).toEqual(6);

    const doubles = aggregationRules.countingBuckets[1];
    expect(doubles.bucketName).toEqual('Doubles');
    expect(doubles.bestOfCount).toEqual(12);

    expect(aggregationRules.tiebreakCriteria).toEqual(['highestSingleResult', 'mostCountingResults']);
  });
});

describe('WTA 2026 Profile Selection', () => {
  it('selects Grand Slam Singles for level 1 MAIN singles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('Grand Slam Singles');
  });

  it('selects WTA Finals Singles for level 2 singles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 2,
    });
    expect(awardProfile?.profileName).toEqual('WTA Finals Singles');
  });

  it('selects WTA 1000 Singles for level 3', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('WTA 1000 Singles');
  });

  it('selects WTA 500 Singles for level 4', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 4,
    });
    expect(awardProfile?.profileName).toEqual('WTA 500 Singles');
  });

  it('selects WTA 250 Singles for level 5', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 5,
    });
    expect(awardProfile?.profileName).toEqual('WTA 250 Singles');
  });

  it('selects WTA 125 Singles for level 6', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 6,
    });
    expect(awardProfile?.profileName).toEqual('WTA 125 Singles');
  });

  it('selects ITF Circuit Singles for level 7 (W100)', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 7,
    });
    expect(awardProfile?.profileName).toEqual('ITF Circuit Singles');
  });

  it('selects ITF Circuit Singles for level 11 (W15)', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 11,
    });
    expect(awardProfile?.profileName).toEqual('ITF Circuit Singles');
  });

  it('selects WTA Qualifying Singles for level 1 QUALIFYING', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('WTA Qualifying Singles');
  });

  it('selects WTA Qualifying Singles for level 3 QUALIFYING', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('WTA Qualifying Singles');
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

  it('selects Grand Slam Doubles Qualifying for level 1 qualifying doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('Grand Slam Doubles Qualifying');
  });

  it('selects WTA Finals Doubles for level 2 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 2,
    });
    expect(awardProfile?.profileName).toEqual('WTA Finals Doubles');
  });

  it('selects WTA 1000 Doubles for level 3 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('WTA 1000 Doubles');
  });

  it('selects WTA 500 Doubles for level 4 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 4,
    });
    expect(awardProfile?.profileName).toEqual('WTA 500 Doubles');
  });

  it('selects WTA 250-ITF W35 Doubles for level 5 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 5,
    });
    expect(awardProfile?.profileName).toEqual('WTA 250–ITF W35 Doubles');
  });

  it('selects ITF W15 Doubles for level 11 doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 11,
    });
    expect(awardProfile?.profileName).toEqual('ITF W15 Doubles');
  });
});

describe('WTA 2026 Ranking Points Values', () => {
  it('Grand Slam Singles champion gets 2000 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 1,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(2000);
    expect(awardProfile.finishingPositionRanges[2]).toEqual(1300);
    expect(awardProfile.finishingPositionRanges[4]).toEqual(780);
    expect(awardProfile.finishingPositionRanges[128]).toEqual(10);
  });

  it('WTA Finals champion gets 1500 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 2,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(1500);
    expect(awardProfile.finishingPositionRanges[2]).toEqual(1080);
    expect(awardProfile.finishingPositionRanges[4]).toEqual(750);
    expect(awardProfile.finishingPositionRanges[8]).toEqual(375);
  });

  it('WTA 1000 Singles has drawSize threshold for R64', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 3,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(1000);
    // R64 is an array with drawSize threshold conditions
    expect(Array.isArray(awardProfile.finishingPositionRanges[64])).toEqual(true);
    expect(awardProfile.finishingPositionRanges[64][0].drawSize).toEqual(64);
    expect(awardProfile.finishingPositionRanges[64][0].value).toEqual(35);
    expect(awardProfile.finishingPositionRanges[64][1].value).toEqual(10);
  });

  it('ITF Circuit Singles values are level-keyed', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 7,
    });
    // W100 champion = 100
    expect(awardProfile.finishingPositionRanges[1]).toEqual({ level: { 7: 100, 8: 75, 9: 50, 10: 35, 11: 15 } });
  });

  it('WTA Qualifying values are level-keyed', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    // GS qualifier = 40
    expect(awardProfile.finishingPositionRanges[1]).toEqual({
      level: { 1: 40, 3: 30, 4: 25, 5: 18, 6: 6, 7: 5, 8: 3, 9: 2, 10: 1 },
    });
    // GS Q1 loser = 2
    expect(awardProfile.finishingPositionRanges[8]).toEqual({ level: { 1: 2 } });
  });

  it('Standard Doubles (L5-10) first-round loss = 1 point', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 5,
    });
    expect(awardProfile.finishingPositionRanges[16]).toEqual(1);
  });

  it('ITF W15 Doubles has no R16 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: MAIN },
      level: 11,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(15);
    expect(awardProfile.finishingPositionRanges[16]).toBeUndefined();
  });

  it('Grand Slam Doubles Qualifying awards 40 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile.finishingPositionRanges[1]).toEqual(40);
  });
});

describe('WTA 2026 Point Calculation', () => {
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
    expect(maxPoints).toEqual(2000);
  });

  it('computes correct points for WTA 250 (level 5)', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 5 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    expect(maxPoints).toEqual(250);
  });

  it('computes correct points for ITF W100 (level 7)', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 7 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    expect(maxPoints).toEqual(100);
  });
});
