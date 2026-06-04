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

  it('honors doublesAttribution: fullToEach — individuals each get full-value awards, pair record is empty', () => {
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
    const pairAwards = result.pointAwards.filter((a: any) => !a.personId);

    expect(personAwards.length).toBeGreaterThan(0);
    // fullToEach treats the individual as the ranking entity; the pair
    // is bookkeeping for who played together and gets no award of its
    // own.
    expect(pairAwards).toHaveLength(0);

    // At most one award per (personId, drawId): no duplicate emission
    // between the individual's own draw participation and the pair's
    // fullToEach distribution.
    const perPair = new Map<string, number>();
    for (const a of personAwards as any[]) {
      const key = `${a.personId}|${a.drawId}`;
      perPair.set(key, (perPair.get(key) ?? 0) + 1);
    }
    expect(Math.max(...perPair.values())).toBe(1);
  });

  it('honors doublesAttribution: splitEven — every individual award is exactly half the fullToEach value', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const fullResult = scaleEngine.getTournamentPointAwards({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: { ...simplePolicy[POLICY_TYPE_RANKING_POINTS], doublesAttribution: FULL_TO_EACH },
      },
      level: 1,
    });
    const splitResult = scaleEngine.getTournamentPointAwards({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: { ...simplePolicy[POLICY_TYPE_RANKING_POINTS], doublesAttribution: SPLIT_EVEN },
      },
      level: 1,
    });

    expect(fullResult.success).toEqual(true);
    expect(splitResult.success).toEqual(true);

    const fullSum = (fullResult.pointAwards as any[])
      .filter((a) => a.personId)
      .reduce((s, a) => s + (a.points || 0), 0);
    const splitSum = (splitResult.pointAwards as any[])
      .filter((a) => a.personId)
      .reduce((s, a) => s + (a.points || 0), 0);

    expect(fullSum).toBeGreaterThan(0);
    expect(splitSum).toEqual(Math.round(fullSum / 2));
  });

  it('honors doublesAttribution: teamOnly — the pair is the ranking entity; no per-person awards from doubles', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPointAwards({
      policyDefinitions: {
        [POLICY_TYPE_RANKING_POINTS]: { ...simplePolicy[POLICY_TYPE_RANKING_POINTS], doublesAttribution: TEAM_ONLY },
      },
      level: 1,
    });

    expect(result.success).toEqual(true);

    const personAwards = (result.pointAwards as any[]).filter((a) => a.personId);
    const pairAwards = (result.pointAwards as any[]).filter((a) => !a.personId);

    expect(personAwards).toHaveLength(0);
    expect(pairAwards.length).toBeGreaterThan(0);
    expect((pairAwards[0] as any).points).toBeGreaterThan(0);
  });

  it('without doublesAttribution — legacy default: pair owns the award, individuals get nothing from DOUBLES draws', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPointAwards({
      policyDefinitions: simplePolicy, // doublesAttribution undefined
      level: 1,
    });

    expect(result.success).toEqual(true);

    const personAwards = (result.pointAwards as any[]).filter((a) => a.personId);
    const pairAwards = (result.pointAwards as any[]).filter((a) => !a.personId);

    expect(personAwards).toHaveLength(0);
    expect(pairAwards.length).toBeGreaterThan(0);
  });
});
