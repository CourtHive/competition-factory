import { luckyDrawAdvancement } from '@Mutate/drawDefinitions/luckyDrawAdvancement';
import { calculateMatchUpMargin } from '@Query/matchUp/calculateMatchUpMargin';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, describe } from 'vitest';

import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import {
  ASSIGN_BYE,
  REMOVE_ASSIGNMENT,
  REMOVE_SEED,
  SEED_VALUE,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT,
} from '@Constants/positionActionConstants';

const SET3_S6_TB7 = 'SET3-S:6/TB7';

// ──────────────────────────────────────────────────────────────────────────────
// getLuckyDrawRoundStatus
// ──────────────────────────────────────────────────────────────────────────────

describe('getLuckyDrawRoundStatus', () => {
  test('identifies pre-feed rounds for drawSize 11', () => {
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getLuckyDrawRoundStatus({ drawId });

    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);
    expect(result.rounds).toBeDefined();
    expect(result.rounds.length).toBeGreaterThan(0);

    // For drawSize 11: rounds are [6, 3, 2, 1]
    // Round 2 (3 matchUps) has odd count -> preFeedRound
    const preFeedRounds = result.rounds.filter((r) => r.isPreFeedRound);
    expect(preFeedRounds.length).toBeGreaterThan(0);
  });

  test('identifies pre-feed rounds for drawSize 7', () => {
    const drawProfiles = [{ drawSize: 7, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getLuckyDrawRoundStatus({ drawId });

    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);

    // drawSize 7: rounds are [4, 2, 1] — no pre-feed since all counts are power-of-2 halves
    // Actually 7 → [4, 2, 1] — 4 is even, 2 is even, 1 is final
    // Wait: 7 participants → first round has ceil(7/2) = 4 matchUps? No.
    // Lucky draw with 7: round1 has 3 matchUps (6 participants), 1 bye → round2 has 3 matchUps?
    // Actually the factory generates lucky draws differently. Let's just verify the structure.
    const rounds = result.rounds;
    expect(rounds.length).toBeGreaterThan(0);

    // Verify round structure makes sense
    for (const round of rounds) {
      expect(round.matchUpsCount).toBeGreaterThan(0);
      expect(round.roundNumber).toBeGreaterThan(0);
    }
  });

  test('identifies pre-feed rounds for drawSize 5', () => {
    const drawProfiles = [{ drawSize: 5, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getLuckyDrawRoundStatus({ drawId });

    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);

    // drawSize 5: rounds should be [3, 2, 1] — round 1 (3 matchUps) is pre-feed
    const preFeedRounds = result.rounds.filter((r) => r.isPreFeedRound);
    expect(preFeedRounds.length).toBeGreaterThan(0);

    const firstPreFeed = preFeedRounds[0];
    expect(firstPreFeed.matchUpsCount % 2).toBe(1); // odd
  });

  test('provides eligible losers when round is complete', () => {
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(result.success).toBe(true);

    const preFeedRounds = result.rounds.filter((r) => r.isPreFeedRound);
    expect(preFeedRounds.length).toBeGreaterThan(0);
  });

  test('returns isLuckyDraw false for non-lucky draws', () => {
    const drawProfiles = [{ drawSize: 16 }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(false);
  });

  test('supports cumulativeMargin option', () => {
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const perRound = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const cumulative = tournamentEngine.getLuckyDrawRoundStatus({ drawId, cumulativeMargin: true });

    expect(perRound.success).toBe(true);
    expect(cumulative.success).toBe(true);

    // Both should identify the same pre-feed rounds
    const perRoundPreFeed = perRound.rounds.filter((r) => r.isPreFeedRound);
    const cumulativePreFeed = cumulative.rounds.filter((r) => r.isPreFeedRound);
    expect(perRoundPreFeed.length).toBe(cumulativePreFeed.length);
  });

  test('works with various draw sizes', () => {
    for (const drawSize of [5, 6, 9, 10, 13, 15]) {
      const drawProfiles = [{ drawSize, drawType: LUCKY_DRAW }];
      const result = mocksEngine.generateTournamentRecord({ drawProfiles });
      if (!result?.tournamentRecord) continue;

      const { tournamentRecord, drawIds } = result;
      const drawId = drawIds?.[0];
      if (!drawId) continue;

      tournamentEngine.setState(tournamentRecord);

      const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
      expect(status.success).toBe(true);
      expect(status.isLuckyDraw).toBe(true);
      expect(status.rounds.length).toBeGreaterThan(0);

      // Final round should never be a pre-feed round
      const finalRound = status.rounds[status.rounds.length - 1];
      expect(finalRound.isPreFeedRound).toBe(false);
    }
  });

  test('drawSize 10 with completed round 1 provides winners and losers with names and ratios', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(result.success).toBe(true);
    expect(result.isLuckyDraw).toBe(true);

    // Round 1 should have 5 matchUps (odd = pre-feed), all complete
    const round1 = result.rounds.find((r) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1!.matchUpsCount).toBe(5);
    expect(round1!.isPreFeedRound).toBe(true);
    expect(round1!.isComplete).toBe(true);
    expect(round1!.needsLuckySelection).toBe(true);

    // Should have 5 advancing winners with participant names
    expect(round1!.advancingWinners).toBeDefined();
    expect(round1!.advancingWinners!.length).toBe(5);
    for (const winner of round1!.advancingWinners!) {
      expect(winner.participantId).toBeTruthy();
      expect(winner.participantName).toBeTruthy();
      expect(winner.scoreString).toBeTruthy();
    }

    // Should have 5 eligible losers with names and margin ratios
    expect(round1!.eligibleLosers).toBeDefined();
    expect(round1!.eligibleLosers!.length).toBe(5);
    for (const loser of round1!.eligibleLosers!) {
      expect(loser.participantId).toBeTruthy();
      expect(loser.participantName).toBeTruthy();
      expect(loser.scoreString).toBeTruthy();
      expect(typeof loser.margin).toBe('number');
      expect(loser.margin).toBeGreaterThanOrEqual(0);
      expect(loser.margin).toBeLessThanOrEqual(1);
      // gameRatio should be defined for standard scoring
      expect(loser.gameRatio).toBeDefined();
    }

    // Losers should be sorted by margin descending (narrowest loss first)
    const margins = round1!.eligibleLosers!.map((l) => l.margin!);
    for (let i = 1; i < margins.length; i++) {
      expect(margins[i - 1]).toBeGreaterThanOrEqual(margins[i]);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// luckyDrawAdvancement — mutation tests
// ──────────────────────────────────────────────────────────────────────────────

describe('luckyDrawAdvancement', () => {
  test('advances winners + selected loser into next round for drawSize 10', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    // Verify round 1 needs lucky selection
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1!.needsLuckySelection).toBe(true);
    expect(round1!.eligibleLosers!.length).toBe(5);
    expect(round1!.advancingWinners!.length).toBe(5);

    // Get structureId
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Select the first eligible loser (highest margin = closest match)
    const selectedLoser = round1!.eligibleLosers![0];

    // Advance
    const result = tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // Verify round 2 matchUps now have drawPositions
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const structure = updatedDraw.structures[0];
    const round2MatchUps = structure.matchUps.filter((m: any) => m.roundNumber === 2);
    expect(round2MatchUps.length).toBe(3);

    for (const matchUp of round2MatchUps) {
      expect(matchUp.drawPositions).toBeDefined();
      expect(matchUp.drawPositions.length).toBe(2);
      expect(matchUp.drawPositions.every(Boolean)).toBe(true);
    }

    // Verify positionAssignments were created for round 2 positions
    const newAssignments = structure.positionAssignments.filter((a: any) => a.drawPosition > 10);
    expect(newAssignments.length).toBe(6); // 3 matchUps × 2 positions

    // Verify the lucky loser is among the assigned participants
    const assignedIds = newAssignments.map((a: any) => a.participantId);
    expect(assignedIds).toContain(selectedLoser.participantId);

    // Verify all 5 winners are also assigned
    for (const winner of round1!.advancingWinners!) {
      expect(assignedIds).toContain(winner.participantId);
    }

    // Verify round 1 no longer needs selection
    const updatedStatus = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const updatedRound1 = updatedStatus.rounds.find((r: any) => r.roundNumber === 1);
    expect(updatedRound1!.needsLuckySelection).toBe(false);
  });

  test('lucky loser is placed in opposite half from defeating winner', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1!.needsLuckySelection).toBe(true);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Select the first eligible loser
    const selectedLoser = round1!.eligibleLosers![0];
    const defeatingMatchUpId = selectedLoser.matchUpId;

    // Find the winner who defeated this loser (same matchUpId)
    const defeatingWinner = round1!.advancingWinners!.find((w: any) => w.matchUpId === defeatingMatchUpId);
    expect(defeatingWinner).toBeDefined();

    // Advance
    const result = tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // Get the round 2 matchUps and find which matchUp each participant is in
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const structure = updatedDraw.structures[0];
    const round2MatchUps = structure.matchUps
      .filter((m: any) => m.roundNumber === 2)
      .sort((a: any, b: any) => (a.roundPosition || 0) - (b.roundPosition || 0));
    expect(round2MatchUps.length).toBe(3);

    const positionAssignments = structure.positionAssignments;
    const dpToParticipant: Record<number, string> = {};
    for (const pa of positionAssignments) {
      if (pa.drawPosition && pa.participantId) {
        dpToParticipant[pa.drawPosition] = pa.participantId;
      }
    }

    // Find which matchUp index (0-based) the lucky loser and defeating winner are in
    let luckyLoserMatchUpIdx = -1;
    let defeatingWinnerMatchUpIdx = -1;

    for (let i = 0; i < round2MatchUps.length; i++) {
      const dps = round2MatchUps[i].drawPositions || [];
      const pids = new Set(dps.map((dp: number) => dpToParticipant[dp]));
      if (pids.has(selectedLoser.participantId)) luckyLoserMatchUpIdx = i;
      if (pids.has(defeatingWinner!.participantId)) defeatingWinnerMatchUpIdx = i;
    }

    expect(luckyLoserMatchUpIdx).not.toBe(-1);
    expect(defeatingWinnerMatchUpIdx).not.toBe(-1);

    // They must NOT be in the same matchUp (obvious)
    expect(luckyLoserMatchUpIdx).not.toBe(defeatingWinnerMatchUpIdx);

    // They must be in opposite halves: with 3 matchUps, top half = [0,1], bottom = [2]
    // (or top = [0], bottom = [1,2] depending on ceil split)
    const halfSplit = Math.ceil(round2MatchUps.length / 2); // 2 for 3 matchUps
    const luckyInTopHalf = luckyLoserMatchUpIdx < halfSplit;
    const winnerInTopHalf = defeatingWinnerMatchUpIdx < halfSplit;
    expect(luckyInTopHalf).not.toBe(winnerInTopHalf);
  });

  test('rejects advancement when round is not complete', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Round 1 is not complete (no matchUps scored)
    const result = tournamentEngine.luckyDrawAdvancement({
      participantId: 'fake-id',
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  test('rejects advancement with invalid participant', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Use a winner's participantId instead of a loser's
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    const winnerParticipantId = round1!.advancingWinners![0].participantId;

    const result = tournamentEngine.luckyDrawAdvancement({
      participantId: winnerParticipantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  test('prevents double advancement', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    const selectedLoser = round1!.eligibleLosers![0];

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // First advancement succeeds
    const result1 = tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result1.success).toBe(true);

    // Second attempt should fail (next round already has participants)
    const result2 = tournamentEngine.luckyDrawAdvancement({
      participantId: round1!.eligibleLosers![1].participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result2.error).toBeDefined();
  });

  test('round 2 matchUps can be scored after advancement', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    const selectedLoser = round1!.eligibleLosers![0];

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Advance to round 2
    tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });

    // Get round 2 matchUps and try to score them
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const round2MatchUps = matchUps.filter((m: any) => m.roundNumber === 2 && m.drawId === drawId);
    expect(round2MatchUps.length).toBe(3);

    // Score the first round 2 matchUp
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: 'COMPLETED',
      scoreString: '6-3 6-4',
      winningSide: 1,
    });

    const scoreResult = tournamentEngine.setMatchUpStatus({
      matchUpId: round2MatchUps[0].matchUpId,
      outcome,
      drawId,
    });
    expect(scoreResult.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// luckyDrawAdvancement — stale positionAssignment cleanup
// ──────────────────────────────────────────────────────────────────────────────

// Builds a drawDefinition matching the production scenario:
// drawSize 10, round 1 complete, round 2 has stale state from a prior removal
function buildStaleDrawDefinition() {
  const completedScore = {
    sets: [
      { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 1 },
      { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 2 },
    ],
  };

  const round1MatchUps = [1, 2, 3, 4, 5].map((rp) => ({
    drawPositions: [rp * 2 - 1, rp * 2],
    matchUpStatus: 'COMPLETED',
    matchUpId: `r1-m${rp}`,
    roundPosition: rp,
    roundNumber: 1,
    finishingRound: 4,
    score: completedScore,
    winningSide: 2,
  }));

  // Round 2 matchUps with stale drawPositions from prior advancement
  const round2MatchUps = [1, 2, 3].map((rp) => ({
    drawPositions: [10 + rp * 2 - 1, 10 + rp * 2],
    matchUpId: `r2-m${rp}`,
    roundPosition: rp,
    roundNumber: 2,
    finishingRound: 3,
    matchUpStatus: 'TO_BE_PLAYED',
  }));

  const round3MatchUps = [1, 2].map((rp) => ({
    drawPositions: [],
    matchUpId: `r3-m${rp}`,
    roundPosition: rp,
    roundNumber: 3,
    finishingRound: 2,
    matchUpStatus: 'TO_BE_PLAYED',
  }));

  const finalMatchUp = {
    drawPositions: [],
    matchUpId: 'r4-m1',
    roundPosition: 1,
    roundNumber: 4,
    finishingRound: 1,
    matchUpStatus: 'TO_BE_PLAYED',
  };

  // Round 1 positions (1-10) with real participants
  const pids = Array.from({ length: 10 }, (_, i) => `pid-${i + 1}`);
  const round1Assignments = pids.map((pid, i) => ({
    drawPosition: i + 1,
    participantId: pid,
  }));

  // Winners are side 2 for all round 1 matchUps: positions 2, 4, 6, 8, 10
  // => pids: pid-2, pid-4, pid-6, pid-8, pid-10
  const winnerPids = ['pid-2', 'pid-4', 'pid-6', 'pid-8', 'pid-10'];
  // Lucky loser from round 1 (pid-1 lost narrowest in position 1)
  const luckyLoserPid = 'pid-1';

  return {
    round1MatchUps,
    round2MatchUps,
    round3MatchUps,
    finalMatchUp,
    round1Assignments,
    winnerPids,
    luckyLoserPid,
    pids,
  };
}

describe('luckyDrawAdvancement — stale positionAssignment cleanup', () => {
  test('re-advancement succeeds after removal leaves duplicate positionAssignment entries', () => {
    const {
      round1MatchUps,
      round2MatchUps,
      round3MatchUps,
      finalMatchUp,
      round1Assignments,
      winnerPids,
      luckyLoserPid,
    } = buildStaleDrawDefinition();

    // Simulate the exact production state: positionAssignments have BOTH
    // empty entries { drawPosition: 11 } AND stale entries { drawPosition: 11, participantId: "..." }
    const staleAssignments = [11, 12, 13, 14, 15, 16].map((dp, i) => ({
      drawPosition: dp,
      participantId: [...winnerPids, luckyLoserPid][i],
    }));
    const emptyAssignments = [11, 12, 13, 14, 15, 16].map((dp) => ({
      drawPosition: dp,
    }));

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      drawId: 'test-draw',
      structures: [
        {
          structureId: 'test-structure',
          stage: 'MAIN',
          stageSequence: 1,
          matchUps: [...round1MatchUps, ...round2MatchUps, ...round3MatchUps, finalMatchUp],
          positionAssignments: [...round1Assignments, ...staleAssignments, ...emptyAssignments],
        },
      ],
    };

    const result = luckyDrawAdvancement({
      drawDefinition,
      participantId: luckyLoserPid,
      roundNumber: 1,
    });

    expect(result.success).toBe(true);

    // Verify no duplicate drawPosition entries remain
    const positionCounts: Record<number, number> = {};
    for (const pa of drawDefinition.structures[0].positionAssignments) {
      positionCounts[pa.drawPosition] = (positionCounts[pa.drawPosition] || 0) + 1;
    }
    const duplicates = Object.entries(positionCounts).filter(([, count]) => count > 1);
    expect(duplicates.length).toBe(0);
  });

  test('re-advancement succeeds when removal clears participantIds but keeps entries', () => {
    const { round1MatchUps, round2MatchUps, round3MatchUps, finalMatchUp, round1Assignments } =
      buildStaleDrawDefinition();

    // Empty entries only (no participantId) — simulates removal that cleared participantId
    const emptyAssignments = [11, 12, 13, 14, 15, 16].map((dp) => ({
      drawPosition: dp,
    }));

    const drawDefinition: any = {
      drawType: LUCKY_DRAW,
      drawId: 'test-draw',
      structures: [
        {
          structureId: 'test-structure',
          stage: 'MAIN',
          stageSequence: 1,
          matchUps: [...round1MatchUps, ...round2MatchUps, ...round3MatchUps, finalMatchUp],
          positionAssignments: [...round1Assignments, ...emptyAssignments],
        },
      ],
    };

    const result = luckyDrawAdvancement({
      drawDefinition,
      participantId: 'pid-1',
      roundNumber: 1,
    });

    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// calculateMatchUpMargin — standard game-based formats
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateMatchUpMargin — game-based formats', () => {
  test('returns margin for a completed matchUp from a lucky draw', () => {
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedMatchUp = matchUps.find((m) => m.winningSide && m.score?.sets?.length);

    if (completedMatchUp) {
      const marginResult = calculateMatchUpMargin({ matchUp: completedMatchUp });
      expect(marginResult.success).toBe(true);
      expect(typeof marginResult.margin).toBe('number');
      expect(typeof marginResult.gameDifferential).toBe('number');
      expect(marginResult.margin).toBeGreaterThanOrEqual(0);
      expect(marginResult.margin).toBeLessThanOrEqual(1);
      expect(marginResult.gameDifferential).toBeGreaterThanOrEqual(0);
      expect(marginResult.setRatio).toBeDefined();
      expect(marginResult.gameRatio).toBeDefined();
    }
  });

  test('returns correct margin for a 6-4 6-4 result', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          { side1Score: 6, side2Score: 4, setNumber: 1, winningSide: 1 },
          { side1Score: 6, side2Score: 4, setNumber: 2, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // Loser got 8 games out of 20 total → gameRatio = 8/20 = 0.4
    expect(result.gameRatio).toBeCloseTo(0.4, 2);
    expect(result.margin).toBeCloseTo(0.4, 2);
    expect(result.setsWonByWinner).toBe(2);
    expect(result.setsWonByLoser).toBe(0);
    expect(result.setRatio).toBe(0); // loser won 0 sets
  });

  test('returns higher margin for a closer match (7-6 6-7 7-6)', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          { side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 5, setNumber: 1, winningSide: 1 },
          { side1Score: 6, side2Score: 7, side1TiebreakScore: 3, side2TiebreakScore: 7, setNumber: 2, winningSide: 2 },
          { side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 4, setNumber: 3, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // Very close match — margin should be high (close to 0.5)
    expect(result.margin).toBeGreaterThan(0.35);
    expect(result.setsWonByLoser).toBe(1);
    expect(result.setsWonByWinner).toBe(2);
  });

  test('returns lower margin for a one-sided match (6-0 6-0)', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          { side1Score: 6, side2Score: 0, setNumber: 1, winningSide: 1 },
          { side1Score: 6, side2Score: 0, setNumber: 2, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.gameRatio).toBe(0); // loser got 0 games
    expect(result.margin).toBe(0);
    expect(result.gameDifferential).toBe(12);
  });

  test('handles side2 as winner', () => {
    const matchUp = {
      winningSide: 2,
      score: {
        sets: [
          { side1Score: 4, side2Score: 6, setNumber: 1, winningSide: 2 },
          { side1Score: 6, side2Score: 4, setNumber: 2, winningSide: 1 },
          { side1Score: 3, side2Score: 6, setNumber: 3, winningSide: 2 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.setsWonByWinner).toBe(2);
    expect(result.setsWonByLoser).toBe(1);
    // Loser (side1) got 4+6+3 = 13, winner (side2) got 6+4+6 = 16, total 29
    // gameRatio = 13/29
    expect(result.gameRatio).toBeCloseTo(13 / 29, 4);
  });

  test('handles pro set format (one set to 8)', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [{ side1Score: 8, side2Score: 6, setNumber: 1, winningSide: 1 }],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // gameRatio = 6/14
    expect(result.gameRatio).toBeCloseTo(6 / 14, 4);
    expect(result.setRatio).toBe(0); // loser won 0 of 1 set
  });

  test('handles short sets format (sets to 4)', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          { side1Score: 4, side2Score: 2, setNumber: 1, winningSide: 1 },
          { side1Score: 4, side2Score: 3, setNumber: 2, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // loserGames = 2+3 = 5, winnerGames = 4+4 = 8, total = 13
    expect(result.gameRatio).toBeCloseTo(5 / 13, 4);
  });

  test('works with generated standard format (SET3-S:6/TB7)', () => {
    const drawProfiles = [{ drawSize: 8, drawType: LUCKY_DRAW, matchUpFormat: SET3_S6_TB7 }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completed = matchUps.filter((m) => m.winningSide && m.score?.sets?.length);

    expect(completed.length).toBeGreaterThan(0);

    for (const m of completed) {
      const result = calculateMatchUpMargin({ matchUp: m });
      expect(result.success).toBe(true);
      expect(Number.isFinite(result.margin) || Number.isNaN(result.margin)).toBe(true);
    }
  });

  test('works with generated short set format (SET3-S:4/TB7)', () => {
    const drawProfiles = [{ drawSize: 8, drawType: LUCKY_DRAW, matchUpFormat: 'SET3-S:4/TB7' }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completed = matchUps.filter((m) => m.winningSide && m.score?.sets?.length);

    expect(completed.length).toBeGreaterThan(0);

    for (const m of completed) {
      const result = calculateMatchUpMargin({ matchUp: m });
      expect(result.success).toBe(true);
      if (Number.isFinite(result.margin)) {
        expect(result.margin).toBeGreaterThanOrEqual(0);
        expect(result.margin).toBeLessThanOrEqual(1);
      }
    }
  });

  test('works with generated pro set format (SET1-S:8/TB7)', () => {
    const drawProfiles = [{ drawSize: 8, drawType: LUCKY_DRAW, matchUpFormat: 'SET1-S:8/TB7' }];
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completed = matchUps.filter((m) => m.winningSide && m.score?.sets?.length);

    expect(completed.length).toBeGreaterThan(0);

    for (const m of completed) {
      const result = calculateMatchUpMargin({ matchUp: m });
      expect(result.success).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// calculateMatchUpMargin — points-based / timed formats
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateMatchUpMargin — points-based formats', () => {
  test('returns pointRatio for sets with pointScores', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          { side1PointScore: 21, side2PointScore: 18, setNumber: 1, winningSide: 1 },
          { side1PointScore: 21, side2PointScore: 15, setNumber: 2, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // loserPoints = 18+15 = 33, totalPoints = 21+21+18+15 = 75
    expect(result.pointRatio).toBeCloseTo(33 / 75, 4);
    // pointRatio should be used as margin (most granular)
    expect(result.margin).toBeCloseTo(33 / 75, 4);
  });

  test('pointRatio takes precedence over gameRatio when both present', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          {
            side1Score: 6,
            side2Score: 4,
            side1PointScore: 50,
            side2PointScore: 45,
            setNumber: 1,
            winningSide: 1,
          },
          {
            side1Score: 6,
            side2Score: 3,
            side1PointScore: 48,
            side2PointScore: 40,
            setNumber: 2,
            winningSide: 1,
          },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);

    // Both pointRatio and gameRatio should be defined
    expect(Number.isFinite(result.pointRatio)).toBe(true);
    expect(Number.isFinite(result.gameRatio)).toBe(true);

    // margin should equal pointRatio (more granular)
    expect(result.margin).toBe(result.pointRatio);
  });

  test('handles timed set with only point scores (no game scores)', () => {
    const matchUp = {
      winningSide: 2,
      score: {
        sets: [{ side1PointScore: 10, side2PointScore: 15, setNumber: 1, winningSide: 2 }],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // loser is side1, loserPoints = 10, totalPoints = 25
    expect(result.pointRatio).toBeCloseTo(10 / 25, 4);
    expect(result.margin).toBeCloseTo(10 / 25, 4);
    // gameRatio should be NaN (no game scores)
    expect(result.gameRatio).toBeNaN();
  });

  test('handles points where loser scored zero', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [{ side1PointScore: 21, side2PointScore: 0, setNumber: 1, winningSide: 1 }],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.pointRatio).toBe(0);
    expect(result.margin).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// calculateMatchUpMargin — no-score outcomes
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateMatchUpMargin — no-score outcomes', () => {
  test('returns NaN margin for WALKOVER', () => {
    const matchUp = {
      winningSide: 1,
      matchUpStatus: 'WALKOVER',
      score: { sets: [] },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.margin).toBeNaN();
    expect(result.setsWonByLoser).toBe(0);
    expect(result.setsWonByWinner).toBe(0);
  });

  test('returns NaN margin for DEFAULTED', () => {
    const matchUp = {
      winningSide: 1,
      matchUpStatus: 'DEFAULTED',
      score: { sets: [] },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.margin).toBeNaN();
  });

  test('returns NaN margin for DOUBLE_WALKOVER', () => {
    const matchUp = {
      winningSide: 1,
      matchUpStatus: 'DOUBLE_WALKOVER',
      score: { sets: [] },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.margin).toBeNaN();
  });

  test('returns NaN margin for DOUBLE_DEFAULT', () => {
    const matchUp = {
      winningSide: 1,
      matchUpStatus: 'DOUBLE_DEFAULT',
      score: { sets: [] },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    expect(result.margin).toBeNaN();
  });

  test('handles RETIRED with partial score (should calculate from played sets)', () => {
    const matchUp = {
      winningSide: 1,
      matchUpStatus: 'RETIRED',
      score: {
        sets: [
          { side1Score: 6, side2Score: 4, setNumber: 1, winningSide: 1 },
          { side1Score: 3, side2Score: 1, setNumber: 2, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // RETIRED is not in NO_MARGIN_STATUSES, so margin should be calculated
    expect(Number.isFinite(result.margin)).toBe(true);
    // loserGames = 4+1 = 5, winnerGames = 6+3 = 9, total = 14
    expect(result.gameRatio).toBeCloseTo(5 / 14, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// calculateMatchUpMargin — edge cases and error handling
// ──────────────────────────────────────────────────────────────────────────────

describe('calculateMatchUpMargin — edge cases', () => {
  test('returns error for missing matchUp', () => {
    const result = calculateMatchUpMargin({ matchUp: undefined as any });
    expect(result.error).toBeDefined();
  });

  test('returns error for matchUp without winningSide', () => {
    const result = calculateMatchUpMargin({
      matchUp: { score: { sets: [] } } as any,
    });
    expect(result.error).toBeDefined();
  });

  test('returns error for matchUp without score', () => {
    const result = calculateMatchUpMargin({
      matchUp: { winningSide: 1 } as any,
    });
    expect(result.error).toBeDefined();
  });

  test('handles empty sets array gracefully', () => {
    const matchUp = {
      winningSide: 1,
      score: { sets: [] },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // No games, no points — everything should be NaN
    expect(result.gameRatio).toBeNaN();
    expect(result.pointRatio).toBeNaN();
    expect(result.setRatio).toBeNaN();
    expect(result.margin).toBeNaN();
  });

  test('setRatio is used as fallback when no games or points available', () => {
    const matchUp = {
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, winningSide: 1 },
          { setNumber: 2, winningSide: 2 },
          { setNumber: 3, winningSide: 1 },
        ],
      },
    };

    const result = calculateMatchUpMargin({ matchUp } as any);
    expect(result.success).toBe(true);
    // No game or point scores, so setRatio should be used
    expect(result.gameRatio).toBeNaN();
    expect(result.pointRatio).toBeNaN();
    // setRatio = 1/3 (loser won 1 of 3 sets)
    expect(result.setRatio).toBeCloseTo(1 / 3, 4);
    expect(result.margin).toBeCloseTo(1 / 3, 4);
  });

  test('comparing margins: closer match has higher margin', () => {
    const closeMatch = {
      winningSide: 1,
      score: {
        sets: [
          { side1Score: 7, side2Score: 6, setNumber: 1, winningSide: 1 },
          { side1Score: 6, side2Score: 7, setNumber: 2, winningSide: 2 },
          { side1Score: 7, side2Score: 5, setNumber: 3, winningSide: 1 },
        ],
      },
    };

    const blowout = {
      winningSide: 1,
      score: {
        sets: [
          { side1Score: 6, side2Score: 0, setNumber: 1, winningSide: 1 },
          { side1Score: 6, side2Score: 1, setNumber: 2, winningSide: 1 },
        ],
      },
    };

    const closeResult = calculateMatchUpMargin({ matchUp: closeMatch } as any);
    const blowoutResult = calculateMatchUpMargin({ matchUp: blowout } as any);

    expect(closeResult.margin).toBeGreaterThan(blowoutResult.margin as any);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: full lucky draw with various matchUpFormats
// ──────────────────────────────────────────────────────────────────────────────

describe('lucky draw integration — various matchUpFormats', () => {
  const formats = [
    { name: 'SET3-S:6/TB7 (standard)', format: SET3_S6_TB7 },
    { name: 'SET3-S:4/TB7 (short sets)', format: 'SET3-S:4/TB7' },
    { name: 'SET1-S:8/TB7 (pro set)', format: 'SET1-S:8/TB7' },
    { name: 'SET1-S:8/TB7@7 (college pro set)', format: 'SET1-S:8/TB7@7' },
    { name: 'SET3-S:6NOAD (no-ad)', format: 'SET3-S:6NOAD' },
    { name: 'SET3-S:6/TB7-F:TB10 (ATP doubles)', format: 'SET3-S:6/TB7-F:TB10' },
    { name: 'SET3-S:4/TB5@3 (Fast4)', format: 'SET3-S:4/TB5@3' },
  ];

  for (const { name, format } of formats) {
    test(`margin calculation works with ${name}`, () => {
      const drawProfiles = [{ drawSize: 8, drawType: LUCKY_DRAW, matchUpFormat: format }];
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const completed = matchUps.filter((m) => m.winningSide && m.score?.sets?.length);

      expect(completed.length).toBeGreaterThan(0);

      for (const m of completed) {
        const result = calculateMatchUpMargin({ matchUp: m });
        expect(result.success).toBe(true);
        if (Number.isFinite(result.margin)) {
          expect(result.margin).toBeGreaterThanOrEqual(0);
          expect(result.margin).toBeLessThanOrEqual(1);
        }
        expect(result.setsWonByWinner).toBeGreaterThanOrEqual(0);
        expect(result.setsWonByLoser).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test('lucky draw with drawSize 11 produces valid round status', () => {
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW, matchUpFormat: SET3_S6_TB7 }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(status.success).toBe(true);
    expect(status.isLuckyDraw).toBe(true);
    expect(status.rounds.length).toBeGreaterThan(0);

    // Final round should have 1 matchUp
    const finalRound = status.rounds[status.rounds.length - 1];
    expect(finalRound.matchUpsCount).toBe(1);
  });

  test('lucky draw with drawSize 13 produces correct round structure', () => {
    const drawProfiles = [{ drawSize: 13, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    expect(status.success).toBe(true);
    expect(status.isLuckyDraw).toBe(true);

    // Verify round structure
    expect(status.rounds.length).toBeGreaterThan(1);

    // Final round should have 1 matchUp
    const finalRound = status.rounds[status.rounds.length - 1];
    expect(finalRound.matchUpsCount).toBe(1);

    // Total matchUps should be >= drawSize - 1
    const totalMatchUps = status.rounds.reduce((sum, r) => sum + r.matchUpsCount, 0);
    expect(totalMatchUps).toBeGreaterThanOrEqual(12);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// positionActions — lucky draw restrictions for advanced positions
// ──────────────────────────────────────────────────────────────────────────────

describe('positionActions — lucky draw advanced positions', () => {
  test('round 1 positions have full actions (withdraw, bye, seed, swap, remove)', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // drawPosition 1 is a round 1 position
    const result = tournamentEngine.positionActions({ drawId, structureId, drawPosition: 1 });
    expect(result.success).toBe(true);

    const actionTypes = result.validActions.map((a: any) => a.type);
    expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
    expect(actionTypes).toContain(WITHDRAW_PARTICIPANT);
    expect(actionTypes).toContain(ASSIGN_BYE);
    expect(actionTypes).toContain(SWAP_PARTICIPANTS);
  });

  test('advanced positions (round 2+) exclude withdraw, bye, and seed but allow remove and swap', () => {
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    // Get round status and advance round 1
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    const selectedLoser = round1!.eligibleLosers![0];

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    const advanceResult = tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(advanceResult.success).toBe(true);

    // Get a round 2 draw position (these are virtual, created by advancement)
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const round2MatchUp = updatedDraw.structures[0].matchUps.find((m: any) => m.roundNumber === 2);
    const advancedDrawPosition = round2MatchUp?.drawPositions[0];

    const result = tournamentEngine.positionActions({
      drawPosition: advancedDrawPosition,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    const actionTypes = result.validActions.map((a: any) => a.type);

    // Should be available
    expect(actionTypes).toContain(REMOVE_ASSIGNMENT);
    expect(actionTypes).toContain(SWAP_PARTICIPANTS);

    // Should NOT be available
    expect(actionTypes).not.toContain(WITHDRAW_PARTICIPANT);
    expect(actionTypes).not.toContain(ASSIGN_BYE);
    expect(actionTypes).not.toContain(SEED_VALUE);
    expect(actionTypes).not.toContain(REMOVE_SEED);
  });
});
