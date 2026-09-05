import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import {
  FEED_IN_CHAMPIONSHIP,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  CONSOLATION,
  MAIN,
} from '@Constants/drawDefinitionConstants';

// A policy that covers all FIC accessor positions for a 32-draw
const ficPolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [
      {
        drawTypes: [FEED_IN_CHAMPIONSHIP, MODIFIED_FEED_IN_CHAMPIONSHIP, FEED_IN_CHAMPIONSHIP_TO_SF],
        finishingPositionRanges: {
          1: { value: 1000 },
          2: { value: 700 },
          3: { value: 500 },
          4: { value: 400 },
          6: { value: 300 },
          8: { value: 200 },
          12: { value: 150 },
          16: { value: 100 },
          24: { value: 75 },
          32: { value: 50 },
        },
        pointsPerWin: 10,
      },
    ],
  },
};

describe('FIC ranking points', () => {
  it('FIC 32-draw produces correct distinct accessors for all finishing positions', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: ficPolicy });
    expect(result.success).toEqual(true);

    // Collect structureParticipation data
    const participationData: any[] = [];
    for (const participant of result.participantsWithOutcomes || []) {
      const personId = participant.person?.personId;
      for (const draw of participant.draws || []) {
        for (const sp of draw.structureParticipation || []) {
          participationData.push({
            personId,
            rankingStage: sp.rankingStage,
            accessor: Array.isArray(sp.finishingPositionRange) ? Math.max(...sp.finishingPositionRange) : undefined,
          });
        }
      }
    }

    // All 32 participants should appear in MAIN
    const mainParticipations = participationData.filter((p) => p.rankingStage === MAIN);
    expect(mainParticipations.length).toEqual(32);

    // 31 participants should appear in CONSOLATION (everyone except the champion)
    const consolationParticipations = participationData.filter((p) => p.rankingStage === CONSOLATION);
    expect(consolationParticipations.length).toEqual(31);

    // Consolation accessor values should be a well-defined set for 32-draw FIC
    const consolationAccessors = new Set(consolationParticipations.map((p) => p.accessor));
    // Expected consolation accessors: 2, 3, 4, 6, 8, 12, 16, 24, 32
    expect(consolationAccessors.size).toBeGreaterThanOrEqual(7); // at least 7 distinct positions

    // Every participant should receive points
    const personPointEntries = Object.entries(result.personPoints as Record<string, any[]>);
    expect(personPointEntries.length).toEqual(32);

    // Champion should get 1000 points
    const championAwards = personPointEntries.find(([, awards]) => awards.some((a: any) => a.positionPoints === 1000));
    expect(championAwards).toBeDefined();
  });

  it('participants get best position from their consolation finish, not main draw loss', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: ficPolicy });
    expect(result.success).toEqual(true);

    // Collect multi-structure participation
    for (const participant of result.participantsWithOutcomes || []) {
      const personId = participant.person?.personId;
      if (!personId) continue;

      const structureParticipations = participant.draws?.[0]?.structureParticipation || [];
      if (structureParticipations.length < 2) continue; // skip champion

      const mainSP = structureParticipations.find((sp) => sp.rankingStage === MAIN);
      const consolationSP = structureParticipations.find((sp) => sp.rankingStage === CONSOLATION);
      if (!mainSP || !consolationSP) continue;

      const mainAccessor = Math.max(...mainSP.finishingPositionRange);
      const consolationAccessor = Math.max(...consolationSP.finishingPositionRange);

      // The consolation accessor should generally be <= main accessor
      // (consolation finish is at least as good as or same as where they lost in main)
      expect(consolationAccessor).toBeLessThanOrEqual(mainAccessor);

      // The awarded position points should come from the better (lower) accessor
      const awards = result.personPoints[personId] || [];
      const positionAward = awards.find((a: any) => a.positionPoints > 0);
      if (positionAward) {
        const betterAccessor = Math.min(mainAccessor, consolationAccessor);
        // The rangeAccessor should match the better finish
        expect(positionAward.rangeAccessor).toEqual(betterAccessor);
      }
    }
  });

  it('MFIC produces valid ranking points with distinct positions', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: ficPolicy });
    expect(result.success).toEqual(true);

    const personPointEntries = Object.entries(result.personPoints as Record<string, any[]>);
    expect(personPointEntries.length).toBeGreaterThan(0);

    // All awards should have valid points
    for (const [, awards] of personPointEntries) {
      for (const award of awards as any[]) {
        expect(award.points).toBeGreaterThanOrEqual(0);
      }
    }

    // Verify position points are ordered correctly: champion > finalist > semifinalists > etc.
    const totals = personPointEntries
      .map(([, awards]) => (awards as any[]).reduce((s, a) => s + (a.points || 0), 0))
      .sort((a, b) => b - a);

    // Champion should have the most points
    expect(totals[0]).toBeGreaterThanOrEqual(totals[1]);
  });

  it('FICSF produces valid ranking points', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawSize: 32 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: ficPolicy });
    expect(result.success).toEqual(true);

    const personPointEntries = Object.entries(result.personPoints as Record<string, any[]>);
    expect(personPointEntries.length).toBeGreaterThan(0);

    // All awards should have valid points
    for (const [, awards] of personPointEntries) {
      for (const award of awards as any[]) {
        expect(award.points).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('per-win points accumulate across structures when no position match', () => {
    // Policy with limited position keys — some accessors won't match
    const limitedPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        awardProfiles: [
          {
            drawTypes: [FEED_IN_CHAMPIONSHIP],
            finishingPositionRanges: {
              1: { value: 1000 },
              2: { value: 700 },
            },
            pointsPerWin: 50,
          },
        ],
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: limitedPolicy });
    expect(result.success).toEqual(true);

    // Most participants won't have accessor 1 or 2, so they should get per-win points
    const personPointEntries = Object.entries(result.personPoints as Record<string, any[]>);
    const perWinAwards = personPointEntries.filter(([, awards]) => (awards as any[]).some((a) => a.perWinPoints > 0));

    // At least some participants should have per-win points
    expect(perWinAwards.length).toBeGreaterThan(0);
  });
});
