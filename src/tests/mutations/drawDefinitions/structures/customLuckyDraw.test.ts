import { customLuckyDraw } from '@Generators/drawDefinitions/drawTypes/customLuckyDraw';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, describe } from 'vitest';

import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';

// ──────────────────────────────────────────────────────────────────────────────
// customLuckyDraw generator — unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe('customLuckyDraw generator', () => {
  test('generates matchUps matching an explicit roundProfile', () => {
    const roundProfile = [20, 12, 8, 4, 2, 1];
    const { matchUps, roundsCount, roundProfile: echoed } = customLuckyDraw({ drawSize: 40, roundProfile });

    expect(roundsCount).toBe(6);
    expect(echoed).toEqual(roundProfile);

    const profile = getRoundMatchUps({ matchUps }).roundProfile ?? {};
    const counts = Object.values(profile).map((v: any) => v.matchUpsCount);
    expect(counts).toEqual([20, 12, 8, 4, 2, 1]);
  });

  test('rejects roundProfile that does not end with 1', () => {
    const { error, matchUps } = customLuckyDraw({ drawSize: 40, roundProfile: [20, 12, 8, 4, 2] });
    expect(error).toBeDefined();
    expect(matchUps).toHaveLength(0);
  });

  test('rejects roundProfile whose first entry does not match drawSize/2', () => {
    const { error, matchUps } = customLuckyDraw({ drawSize: 40, roundProfile: [16, 12, 8, 4, 2, 1] });
    expect(error).toBeDefined();
    expect(matchUps).toHaveLength(0);
  });

  test('rejects a transition that would drop winners', () => {
    // 20 winners → next round of 8 matchUps (16 slots) drops 4 winners. Disallowed.
    const { error, matchUps } = customLuckyDraw({ drawSize: 40, roundProfile: [20, 8, 4, 2, 1] });
    expect(error).toBeDefined();
    expect(matchUps).toHaveLength(0);
  });

  test('accepts pure halving profile (degenerate but valid)', () => {
    const roundProfile = [8, 4, 2, 1];
    const { matchUps, error } = customLuckyDraw({ drawSize: 16, roundProfile });
    expect(error).toBeUndefined();
    const profile = getRoundMatchUps({ matchUps }).roundProfile ?? {};
    const counts = Object.values(profile).map((v: any) => v.matchUpsCount);
    expect(counts).toEqual([8, 4, 2, 1]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// End-to-end: round-status + advancement with multi-LL
// ──────────────────────────────────────────────────────────────────────────────

// The end-to-end LUCKY_DRAW tests exercise stochastic code paths in
// `mocksEngine.generateTournamentRecord` (R1 outcomes) and
// `luckyDrawAdvancement` (LL placement scoring tie-breaks). Both honor
// `nonRandom: <seed>`, which the engine wrappers transform into a seeded
// `random` function before dispatch — see mocksEngine middleware at
// src/assemblies/engines/mock/index.ts and the equivalent in
// src/assemblies/engines/sync/engineInvoke.ts.
describe('LUCKY_DRAW with explicit roundProfile end-to-end', () => {
  test('round-status reports requiredLuckyLoserCount derived from profile', () => {
    const roundProfile = [20, 12, 8, 4, 2, 1];
    const drawProfiles = [{ drawSize: 40, drawType: LUCKY_DRAW, roundProfile }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ completeAllMatchUps: true, drawProfiles, nonRandom: 1 });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(status.success).toBe(true);
    expect(status.isLuckyDraw).toBe(true);

    // R1 → R2: 20 winners + 4 LL = 24 = 12 matchUps × 2
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1!.matchUpsCount).toBe(20);
    expect(round1!.requiredLuckyLoserCount).toBe(4);
    expect(round1!.isPreFeedRound).toBe(true);

    // R2 → R3: 12 winners + 4 LL = 16 = 8 matchUps × 2
    const round2 = status.rounds.find((r: any) => r.roundNumber === 2);
    expect(round2).toBeDefined();
    expect(round2!.matchUpsCount).toBe(12);
    expect(round2!.requiredLuckyLoserCount).toBe(4);

    // R3 → R4: 8 winners → 4 matchUps × 2, no LL
    const round3 = status.rounds.find((r: any) => r.roundNumber === 3);
    expect(round3!.requiredLuckyLoserCount).toBe(0);
    expect(round3!.isPreFeedRound).toBe(false);
  });

  test('advancement places 4 lucky losers into R2 with no LL sharing a half with its defeating winner', () => {
    const roundProfile = [20, 12, 8, 4, 2, 1];
    const drawProfiles = [{ drawSize: 40, drawType: LUCKY_DRAW, roundProfile }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ completeAllMatchUps: true, drawProfiles, nonRandom: 1 });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1!.requiredLuckyLoserCount).toBe(4);
    expect(round1!.eligibleLosers!.length).toBe(20);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Pick the top 4 lucky losers (by margin, narrowest losses first)
    const selectedLL = round1!.eligibleLosers!.slice(0, 4);
    const participantIds = selectedLL.map((l: any) => l.participantId);

    let result: any = tournamentEngine.luckyDrawAdvancement({
      participantIds,
      roundNumber: 1,
      structureId,
      drawId,
      nonRandom: 2,
    });
    expect(result.success).toBe(true);

    // R2 should now have 12 matchUps fully populated (24 participants)
    const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
    const structure = updated.structures[0];
    const r2 = structure.matchUps
      .filter((m: any) => m.roundNumber === 2)
      .sort((a: any, b: any) => (a.roundPosition || 0) - (b.roundPosition || 0));
    expect(r2.length).toBe(12);
    for (const m of r2) {
      expect(m.drawPositions).toHaveLength(2);
      expect(m.drawPositions.every(Boolean)).toBe(true);
    }

    // Build position → participantId map from R2 assignments
    const r2Positions = new Set(r2.flatMap((m: any) => m.drawPositions));
    const r2Assignments = structure.positionAssignments.filter((a: any) => r2Positions.has(a.drawPosition));
    expect(r2Assignments.length).toBe(24);
    expect(r2Assignments.filter((a: any) => a.participantId).length).toBe(24);

    // All 4 selected LL are in R2
    const r2ParticipantIds = new Set(r2Assignments.map((a: any) => a.participantId));
    for (const id of participantIds) {
      expect(r2ParticipantIds.has(id)).toBe(true);
    }

    // For each LL, the matchUp it lands in should be in a different half of R2
    // than the matchUp its defeating winner lands in.
    const halfSplit = Math.ceil(12 / 2); // matchUps 0..5 = top half, 6..11 = bottom half
    const matchUpOfParticipant = (pid: string): number => {
      for (let i = 0; i < r2.length; i++) {
        const a = r2Assignments.find((x: any) => x.drawPosition === r2[i].drawPositions[0]);
        const b = r2Assignments.find((x: any) => x.drawPosition === r2[i].drawPositions[1]);
        if (a?.participantId === pid || b?.participantId === pid) return i;
      }
      return -1;
    };

    let sameHalfCount = 0;
    for (const ll of selectedLL) {
      const llMatchUpIdx = matchUpOfParticipant(ll.participantId);
      const defeatingWinner = round1!.advancingWinners!.find((w: any) => w.matchUpId === ll.matchUpId);
      expect(defeatingWinner).toBeDefined();
      const winnerMatchUpIdx = matchUpOfParticipant(defeatingWinner!.participantId);

      const llHalf = llMatchUpIdx < halfSplit ? 0 : 1;
      const winnerHalf = winnerMatchUpIdx < halfSplit ? 0 : 1;
      if (llHalf === winnerHalf) sameHalfCount++;
    }

    // 4 LL across 12 matchUps with half-avoidance scoring should land 0 in same half.
    expect(sameHalfCount).toBe(0);
  });

  test('rejects advancement when participantIds length does not match requiredLuckyLoserCount', () => {
    const roundProfile = [20, 12, 8, 4, 2, 1];
    const drawProfiles = [{ drawSize: 40, drawType: LUCKY_DRAW, roundProfile }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ completeAllMatchUps: true, drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Only 2 LL provided; required is 4
    const participantIds = round1!.eligibleLosers!.slice(0, 2).map((l: any) => l.participantId);
    const result = tournamentEngine.luckyDrawAdvancement({
      participantIds,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBeFalsy();
    expect(result.error).toBeDefined();
  });
});
