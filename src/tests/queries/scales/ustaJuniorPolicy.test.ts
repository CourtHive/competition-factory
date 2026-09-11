import { POLICY_RANKING_POINTS_USTA_JUNIOR_2025 } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR_2025';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, TEAM_EVENT } from '@Constants/eventConstants';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  MAIN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

const policyDefinitions = POLICY_RANKING_POINTS_USTA_JUNIOR_2025;
const policy = policyDefinitions[POLICY_TYPE_RANKING_POINTS];

describe('USTA Junior 2025 Policy Structure', () => {
  it('has correct policy metadata', () => {
    expect(policy.policyName).toEqual('USTA Junior 2025');
    expect(policy.policyVersion).toEqual('2025.01');
    expect(policy.awardProfiles.length).toBeGreaterThan(0);
    expect(policy.qualityWinProfiles.length).toEqual(1);
    expect(policy.aggregationRules).toBeDefined();
    expect(policy.doublesAttribution).toEqual('fullToEach');
  });

  it('has all 15 award profiles', () => {
    // 4 RR playoff brackets + 1 RR playoff L6-7 + 2 RR + 1 Team + 2 Flighted
    // + 1 Curtis + 2 FIC + 2 Elimination = 15
    expect(policy.awardProfiles.length).toEqual(15);
    const profileNames = policy.awardProfiles.map((p) => p.profileName);
    expect(profileNames).toContain('Round Robin L3-5');
    expect(profileNames).toContain('Round Robin L6-7');
    expect(profileNames).toContain('RR Playoff L3-5: Champion Bracket Main Draw');
    expect(profileNames).toContain('RR Playoff L6-7');
    expect(profileNames).toContain('Team Tournaments');
    expect(profileNames).toContain('Flighted L4');
    expect(profileNames).toContain('Flighted L5');
    expect(profileNames).toContain('Curtis Consolation L1-5');
    expect(profileNames).toContain('FIC through QF L1-5');
    expect(profileNames).toContain('FIC through R16 + QF Playoffs L1-5');
    expect(profileNames).toContain('Elimination L1-5');
    expect(profileNames).toContain('Elimination L6-7');
  });

  it('has 9 quality win ranges', () => {
    const ranges = policy.qualityWinProfiles[0].rankingRanges;
    expect(ranges.length).toEqual(9);
    expect(ranges[0]).toEqual({ rankRange: [1, 10], value: 225 });
    expect(ranges[8]).toEqual({ rankRange: [351, 500], value: 11 });
  });

  it('has 3 counting buckets', () => {
    const buckets = policy.aggregationRules.countingBuckets;
    expect(buckets.length).toEqual(3);
    expect(buckets[0].bucketName).toEqual('Singles');
    expect(buckets[0].bestOfCount).toEqual(6);
    expect(buckets[1].bucketName).toEqual('Doubles');
    expect(buckets[1].bestOfCount).toEqual(2);
    expect(buckets[2].bucketName).toEqual('Quality Wins');
    expect(buckets[2].bestOfCount).toEqual(0);
  });
});

describe('USTA Junior 2025 Profile Selection', () => {
  it('selects Round Robin L3-5 profile', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: ROUND_ROBIN,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('Round Robin L3-5');
  });

  it('selects Round Robin L6-7 profile', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: ROUND_ROBIN,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 7,
    });
    expect(awardProfile?.profileName).toEqual('Round Robin L6-7');
  });

  it('selects Team profile', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      eventType: TEAM_EVENT,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('Team Tournaments');
  });

  it('selects Curtis Consolation profile', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: CURTIS_CONSOLATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 2,
    });
    expect(awardProfile?.profileName).toEqual('Curtis Consolation L1-5');
  });

  it('selects FIC through QF profile', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: FEED_IN_CHAMPIONSHIP_TO_QF,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('FIC through QF L1-5');
  });

  it('selects FIC through R16 profile', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: FEED_IN_CHAMPIONSHIP_TO_R16,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('FIC through R16 + QF Playoffs L1-5');
  });

  it('selects Elimination L1-5 for compass at L3', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: COMPASS,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 3,
    });
    expect(awardProfile?.profileName).toEqual('Elimination L1-5');
  });

  it('selects Elimination L6-7 for compass at L7', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: COMPASS,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 7,
    });
    expect(awardProfile?.profileName).toEqual('Elimination L6-7');
  });

  it('selects Elimination L6-7 for FIC draw types at L6', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: FEED_IN_CHAMPIONSHIP_TO_QF,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 6,
    });
    expect(awardProfile?.profileName).toEqual('Elimination L6-7');
  });

  it('selects Elimination L6-7 for modified feed-in at L6', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 6,
    });
    expect(awardProfile?.profileName).toEqual('Elimination L6-7');
  });

  it('selects Elimination L1-5 for single elimination at L5', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: MAIN, flightNumber: 1 },
      level: 5,
    });
    expect(awardProfile?.profileName).toEqual('Elimination L1-5');
  });
});

describe('USTA Junior 2025 Point Calculation', () => {
  it('computes correct points for a Compass draw at Level 1', () => {
    const drawProfiles = [{ drawType: COMPASS, drawSize: 32 }];
    mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      setState: true,
      drawProfiles,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 1 });
    expect(result.success).toEqual(true);
    expect(Object.keys(result.personPoints).length).toBeGreaterThan(0);

    // Champion should get 3000 position points
    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    expect(maxPoints).toEqual(3000);
  });

  it('computes correct points for a Compass draw at Level 3', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 3 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPoints = Math.max(...allAwards.map((a: any) => a.positionPoints));
    expect(maxPoints).toEqual(900); // L3 Champion
  });

  it('computes correct points for a Curtis Consolation at Level 2', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize: 32, completionGoal: 24 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 2 });
    expect(result.success).toEqual(true);
    expect(Object.keys(result.personPoints).length).toBeGreaterThan(0);
  });

  it('computes correct per-win points for Round Robin at Level 5', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 5 });
    expect(result.success).toEqual(true);

    // In a 4-player RR, winner has 3 wins → 3 * 75 = 225 points
    const allAwards = Object.values(result.personPoints).flat() as any[];
    const maxPerWin = Math.max(...allAwards.map((a: any) => a.perWinPoints));
    expect(maxPerWin).toEqual(225); // 3 wins * 75 per win at L5
  });
});
