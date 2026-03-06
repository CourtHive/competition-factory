import { POLICY_RANKING_POINTS_ITF_WTT } from '@Fixtures/policies/POLICY_RANKING_POINTS_ITF_WTT';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const policyDefinitions = POLICY_RANKING_POINTS_ITF_WTT;
const policy = policyDefinitions[POLICY_TYPE_RANKING_POINTS];

describe('ITF WTT 2020 Policy Structure', () => {
  it('has correct policy metadata', () => {
    expect(policy.policyName).toEqual('ITF World Tennis Tour 2020');
    expect(policy.policyVersion).toEqual('2020.01');
    expect(policy.validDateRange.startDate).toEqual('2020-01-01');
    expect(policy.doublesAttribution).toEqual('fullToEach');
  });

  it('has exactly 2 award profiles', () => {
    expect(policy.awardProfiles.length).toEqual(2);
    const profileNames = policy.awardProfiles.map((p) => p.profileName);
    expect(profileNames).toContain('ITF WTT Qualifying Singles');
    expect(profileNames).toContain('ITF WTT Qualifying Doubles');
  });

  it('has correct aggregation rules', () => {
    const { aggregationRules } = policy;
    expect(aggregationRules.rollingPeriodDays).toEqual(364);
    expect(aggregationRules.separateByGender).toEqual(true);
    expect(aggregationRules.perCategory).toEqual(false);
    expect(aggregationRules.bestOfCount).toEqual(14);
  });
});

describe('ITF WTT 2020 Profile Selection', () => {
  it('selects qualifying singles for QUALIFYING singles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('ITF WTT Qualifying Singles');
  });

  it('selects qualifying doubles for QUALIFYING doubles', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile?.profileName).toEqual('ITF WTT Qualifying Doubles');
  });

  it('no profile for MAIN stage (ITF 2020 only awards qualifying points)', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: 'MAIN' },
      level: 1,
    });
    expect(awardProfile).toBeUndefined();
  });
});

describe('ITF WTT 2020 Ranking Points Values', () => {
  it('qualifying singles values are level-keyed for position 1 (qualifier)', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    // Qualifier points: L1=4, L2=3, L3=3, L4=2
    expect(awardProfile.finishingPositionRanges[1]).toEqual({ level: { 1: 4, 2: 3, 3: 3, 4: 2 } });
    // Final round qualifying loser = 1 for all levels
    expect(awardProfile.finishingPositionRanges[2]).toEqual(1);
  });

  it('$25,000 +H qualifier gets 4 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    expect(awardProfile.finishingPositionRanges[1].level[1]).toEqual(4);
  });

  it('$25,000 qualifier gets 3 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 2,
    });
    expect(awardProfile.finishingPositionRanges[1].level[2]).toEqual(3);
  });

  it('$15,000 qualifier gets 2 points', () => {
    const { awardProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 4,
    });
    expect(awardProfile.finishingPositionRanges[1].level[4]).toEqual(2);
  });

  it('qualifying doubles have same point structure as singles', () => {
    const { awardProfile: singlesProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    const { awardProfile: doublesProfile } = getAwardProfile({
      awardProfiles: policy.awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: DOUBLES,
      participation: { participationOrder: 1, rankingStage: QUALIFYING },
      level: 1,
    });
    // Same point values for singles and doubles qualifying
    expect(doublesProfile.finishingPositionRanges[1]).toEqual(singlesProfile.finishingPositionRanges[1]);
    expect(doublesProfile.finishingPositionRanges[2]).toEqual(singlesProfile.finishingPositionRanges[2]);
  });
});
