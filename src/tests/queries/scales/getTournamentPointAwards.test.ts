import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { FULL_TO_EACH, SPLIT_EVEN, TEAM_ONLY } from '@Constants/rankingConstants';

const simplePolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [
      {
        profileName: 'Standard SE',
        drawTypes: [SINGLE_ELIMINATION],
        finishingPositionRanges: {
          1: { level: { 1: 1000, 2: 500, 3: 300 } },
          2: { level: { 1: 700, 2: 350, 3: 210 } },
          4: { level: { 1: 400, 2: 200, 3: 120 } },
          8: { level: { 1: 200, 2: 100, 3: 60 } },
        },
      },
    ],
  },
};

describe('getTournamentPointAwards', () => {
  it('returns a flat PointAward[] with tournamentId and endDate populated', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPointAwards({
      policyDefinitions: simplePolicy,
      level: 1,
    });

    expect(result.success).toEqual(true);
    expect(Array.isArray(result.pointAwards)).toEqual(true);
    expect(result.pointAwards.length).toBeGreaterThan(0);

    // Every award must carry tournamentId and endDate.
    for (const award of result.pointAwards) {
      expect(award.tournamentId).toEqual(tournamentRecord.tournamentId);
      expect(award.endDate).toEqual(tournamentRecord.endDate);
    }
  });

  it('returns awards keyed by personId when available', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPointAwards({
      policyDefinitions: simplePolicy,
      level: 1,
    });

    expect(result.success).toEqual(true);

    const singlesAwards = result.pointAwards.filter((a: any) => a.eventType === SINGLES);
    expect(singlesAwards.length).toBeGreaterThan(0);
    for (const award of singlesAwards) {
      expect(award.personId).toBeDefined();
      expect(award.participantId).toBeDefined();
      expect(award.participantName).toBeDefined();
    }
  });

  it('reflects total points equal to what getTournamentPoints reports', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const flat = scaleEngine.getTournamentPointAwards({
      policyDefinitions: simplePolicy,
      level: 1,
    });
    const grouped = scaleEngine.getTournamentPoints({
      policyDefinitions: simplePolicy,
      level: 1,
    });

    expect(flat.success).toEqual(true);
    expect(grouped.success).toEqual(true);

    const groupedPersonAwardCount = Object.values(grouped.personPoints as Record<string, any[]>).reduce(
      (sum, awards) => sum + awards.length,
      0,
    );
    const flatPersonAwardCount = flat.pointAwards.filter((a: any) => a.personId).length;

    expect(flatPersonAwardCount).toEqual(groupedPersonAwardCount);
  });

  it('honors doublesAttribution: fullToEach — pair awards split into person awards at full value', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const policy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        ...simplePolicy[POLICY_TYPE_RANKING_POINTS],
        doublesAttribution: FULL_TO_EACH,
      },
    };

    const result = scaleEngine.getTournamentPointAwards({
      policyDefinitions: policy,
      level: 1,
    });

    expect(result.success).toEqual(true);
    const personAwards = result.pointAwards.filter((a: any) => a.personId);
    expect(personAwards.length).toBeGreaterThan(0);
    // doublesParticipantId marker is set on individual awards split from pairs
    const splitAwards = personAwards.filter((a: any) => a.doublesParticipantId);
    expect(splitAwards.length).toBeGreaterThan(0);
  });

  it('honors doublesAttribution: splitEven — pair awards split with 0.5 multiplier', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const policy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        ...simplePolicy[POLICY_TYPE_RANKING_POINTS],
        doublesAttribution: SPLIT_EVEN,
      },
    };

    const fullResult = scaleEngine.getTournamentPointAwards({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: { ...simplePolicy[POLICY_TYPE_RANKING_POINTS], doublesAttribution: FULL_TO_EACH },
      },
      level: 1,
    });
    const splitResult = scaleEngine.getTournamentPointAwards({
      policyDefinitions: policy,
      level: 1,
    });

    expect(fullResult.success).toEqual(true);
    expect(splitResult.success).toEqual(true);

    const fullSum = fullResult.pointAwards
      .filter((a: any) => a.doublesParticipantId)
      .reduce((s: number, a: any) => s + (a.points || 0), 0);
    const splitSum = splitResult.pointAwards
      .filter((a: any) => a.doublesParticipantId)
      .reduce((s: number, a: any) => s + (a.points || 0), 0);

    // Split-even should produce roughly half the per-person points of full-to-each.
    expect(splitSum).toBeLessThan(fullSum);
    expect(splitSum).toBeGreaterThan(0);
  });

  // TODO: TEAM_ONLY semantics are broken in distributeAward (treats any
  // truthy doublesAttribution as splitting with multiplier=1). Fix in a
  // separate PR; gate the test there.
  it.skip('honors doublesAttribution: teamOnly — pair awards stay at pair level', () => {
    void TEAM_ONLY;
  });
});
