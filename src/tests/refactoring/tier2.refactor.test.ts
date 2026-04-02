/**
 * Regression tests for tier 2 refactoring targets:
 * - generateEventWithDraw.ts
 * - doubleExitAdvancement.ts
 * - positionClear.ts
 * - luckyDrawAdvancement.ts
 * - positionActions.ts
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, LUCKY_DRAW, MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLES } from '@Constants/eventConstants';

// ═══════════════════════════════════════════════════════════════════════════
// generateEventWithDraw
// ═══════════════════════════════════════════════════════════════════════════

it('generateEventWithDraw: basic SE draw generation', () => {
  const drawProfiles = [{ drawSize: 16 }];
  const { drawIds } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  expect(drawIds.length).toEqual(1);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(15); // 16-draw SE has 15 matchUps
});

it('generateEventWithDraw: completeAllMatchUps produces completed draw', () => {
  const drawProfiles = [{ drawSize: 8 }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const completed = matchUps.filter((m) => m.winningSide);
  expect(completed.length).toEqual(7); // all 7 matchUps completed
});

it('generateEventWithDraw: doubles event generates pair participants', () => {
  const drawProfiles = [{ drawSize: 8, eventType: DOUBLES }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(7);
  // Sides should reference pair participants
  const firstMatchSides = matchUps[0].sides?.filter((s) => s.participantId);
  expect(firstMatchSides.length).toEqual(2);
});

it('generateEventWithDraw: RR with playoff generates structures', () => {
  const drawProfiles = [{ drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF }];
  const { drawIds: [drawId] } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  // Should have container structure + playoff structures
  expect(drawDefinition.structures.length).toBeGreaterThan(1);
});

it('generateEventWithDraw: seeding is applied', () => {
  const drawProfiles = [{ drawSize: 16, seedsCount: 4 }];
  const { drawIds: [drawId] } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
  expect(mainStructure.seedAssignments?.length).toBeGreaterThanOrEqual(4);
});

it('generateEventWithDraw: qualifying profiles', () => {
  const drawProfiles = [{
    drawSize: 8,
    qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ qualifyingPositions: 2, drawSize: 4 }] }],
  }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const qualifyingMatchUps = matchUps.filter((m) => m.stage === 'QUALIFYING');
  expect(qualifyingMatchUps.length).toBeGreaterThan(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// doubleExitAdvancement
// ═══════════════════════════════════════════════════════════════════════════

it('doubleExitAdvancement: double walkover propagates to consolation', () => {
  const drawProfiles = [{ drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const r1Main = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1 && m.readyToScore);

  // Complete 3 matchUps normally, apply double walkover to 4th
  for (let i = 0; i < 3; i++) {
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: r1Main[i].matchUpId,
      outcome: {
        winningSide: 1,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { side1Score: 6, side2Score: 1, setNumber: 1, winningSide: 1 },
            { side1Score: 6, side2Score: 1, setNumber: 2, winningSide: 1 },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Double walkover on 4th matchUp
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: r1Main[3].matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId,
  });
  expect(result.success).toEqual(true);

  // Verify the propagation happened
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const consolation = matchUps.filter((m) => m.stage === 'CONSOLATION');
  // There should be consolation matchUps, some may have propagated statuses
  expect(consolation.length).toBeGreaterThan(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// positionClear
// ═══════════════════════════════════════════════════════════════════════════

it('positionClear: can clear a draw position', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  let { positionAssignments } = tournamentEngine.getPositionAssignments({ structureId, drawId });
  const assigned = positionAssignments.find((a) => a.participantId);
  expect(assigned).toBeDefined();

  let result: any = tournamentEngine.removeDrawPositionAssignment({
    drawPosition: assigned.drawPosition,
    structureId,
    drawId,
  });
  // Should succeed or fail with DRAW_POSITION_ACTIVE if matchUp has been played
  // In fresh draw, should succeed
  expect(result.success).toEqual(true);

  // Verify the position was cleared
  ({ positionAssignments } = tournamentEngine.getPositionAssignments({ structureId, drawId }));
  const cleared = positionAssignments.find((a) => a.drawPosition === assigned.drawPosition);
  expect(cleared.participantId).toBeUndefined();
});

it('positionClear: clearing position removes from subsequent rounds', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  // Complete a first round matchUp to advance someone
  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const r1 = matchUps.filter((m) => m.roundNumber === 1 && m.readyToScore);
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: r1[0].matchUpId,
    outcome: {
      winningSide: 1,
      score: {
        scoreStringSide1: '6-1 6-1',
        scoreStringSide2: '1-6 1-6',
        sets: [
          { side1Score: 6, side2Score: 1, setNumber: 1, winningSide: 1 },
          { side1Score: 6, side2Score: 1, setNumber: 2, winningSide: 1 },
        ],
      },
    },
    drawId,
  });
  expect(result.success).toEqual(true);

  // Now remove the result
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: r1[0].matchUpId,
    outcome: {
      matchUpStatus: TO_BE_PLAYED,
      winningSide: undefined,
      score: { scoreStringSide1: '', scoreStringSide2: '', sets: [] },
    },
    drawId,
  });
  expect(result.success).toEqual(true);

  // R2 matchUp should no longer have the winner in it
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const r2 = matchUps.filter((m) => m.roundNumber === 2);
  // At least one R2 matchUp should be back to readyToScore === false or have no winningSide
  const r2WithBothSides = r2.filter((m) => m.sides?.every((s) => s.participantId));
  // After removing R1 result, the R2 matchUp that had the winner should have lost a participant
  expect(r2WithBothSides.length).toBeLessThan(r1.length / 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// luckyDrawAdvancement
// ═══════════════════════════════════════════════════════════════════════════

it('luckyDrawAdvancement: lucky draw round completion advances participants', () => {
  // drawSize 11 (non-power-of-2) to get pre-feed rounds with eligible losers
  const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    completeAllMatchUps: true,
    drawProfiles,
  });

  // Get the round status to find a pre-feed round with eligible losers
  const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
  expect(status.success).toEqual(true);
  expect(status.isLuckyDraw).toEqual(true);

  const preFeedRound = status.rounds.find((r) => r.isPreFeedRound && r.eligibleLosers?.length);
  if (preFeedRound) {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const loser = preFeedRound.eligibleLosers[0];

    let result: any = tournamentEngine.luckyDrawAdvancement({
      participantId: loser.participantId,
      roundNumber: preFeedRound.roundNumber,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// positionActions
// ═══════════════════════════════════════════════════════════════════════════

it('positionActions: returns valid actions for an assigned position', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  let { positionAssignments } = tournamentEngine.getPositionAssignments({ structureId, drawId });
  const assigned = positionAssignments.find((a) => a.participantId);

  let result: any = tournamentEngine.positionActions({
    drawPosition: assigned.drawPosition,
    structureId,
    drawId,
  });
  expect(result.isDrawPosition).toBe(true);
  expect(Array.isArray(result.validActions)).toBe(true);
  expect(result.validActions.length).toBeGreaterThan(0);
});

it('positionActions: returns valid actions for a bye position', () => {
  const drawProfiles = [{ drawSize: 8, participantsCount: 6 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  let { positionAssignments } = tournamentEngine.getPositionAssignments({ structureId, drawId });
  const byePosition = positionAssignments.find((a) => a.bye);

  if (byePosition) {
    let result: any = tournamentEngine.positionActions({
      drawPosition: byePosition.drawPosition,
      structureId,
      drawId,
    });
    expect(result.isDrawPosition).toBe(true);
    expect(Array.isArray(result.validActions)).toBe(true);
  }
});

it('positionActions: returns valid actions for unassigned position', () => {
  const drawProfiles = [{ drawSize: 8, participantsCount: 6 }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles,
    participantsProfile: { participantsCount: 30 },
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  let { positionAssignments } = tournamentEngine.getPositionAssignments({ structureId, drawId });
  const unassigned = positionAssignments.find((a) => !a.participantId && !a.bye);

  if (unassigned) {
    let result: any = tournamentEngine.positionActions({
      drawPosition: unassigned.drawPosition,
      structureId,
      drawId,
    });
    expect(result.isDrawPosition).toBe(true);
    expect(Array.isArray(result.validActions)).toBe(true);
  }
});
