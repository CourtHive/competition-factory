import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, describe } from 'vitest';

// constants
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';

/**
 * Helper: complete all scoreable matchUps in a given round
 */
function completeRound(drawId: string, roundNumber: number) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [roundNumber] },
  });
  for (const m of matchUps) {
    if (m.matchUpStatus !== BYE && m.matchUpStatus !== COMPLETED && m.readyToScore) {
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: m.matchUpId,
        outcome: { winningSide: 1 },
        matchUpFormat: 'SET3-S:6/TB7',
        drawId,
      });
      expect(result.success).toBe(true);
    }
  }
}

describe('lucky draw BYE in later rounds', () => {
  test('drawSize 9: full progression through all rounds with BYE', () => {
    // drawSize 9 → 10 positions (1 BYE), round profile: [5, 3, 2, 1]
    // Round 1: 5 matchUps (pre-feed), 1 BYE → 5 winners (4 scored + 1 BYE-advanced), 4 losers
    // Round 2: 3 matchUps (pre-feed) → 3 winners + 1 lucky loser = 4
    // Round 3: 2 matchUps → 2 winners
    // Round 4: 1 matchUp (final)
    const drawProfiles = [{ drawSize: 9, drawType: LUCKY_DRAW }];
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

    // ── Round 1 ──
    let status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r) => r.roundNumber === 1);
    expect(round1!.isComplete).toBe(true);
    expect(round1!.isPreFeedRound).toBe(true);
    expect(round1!.needsLuckySelection).toBe(true);
    expect(round1!.advancingWinners!.length).toBe(5);
    expect(round1!.eligibleLosers!.length).toBe(4); // BYE matchUp has no loser

    // Advance round 1
    const round1Loser = round1!.eligibleLosers![0];
    let result = tournamentEngine.luckyDrawAdvancement({
      participantId: round1Loser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // ── Round 2 ──
    // Complete round 2 matchUps
    completeRound(drawId, 2);

    // Check round 2 status
    status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round2 = status.rounds.find((r) => r.roundNumber === 2);

    expect(round2).toBeDefined();
    expect(round2!.matchUpsCount).toBe(3);
    expect(round2!.isComplete).toBe(true);
    expect(round2!.isPreFeedRound).toBe(true);
    expect(round2!.needsLuckySelection).toBe(true);
    expect(round2!.advancingWinners!.length).toBe(3);
    expect(round2!.eligibleLosers!.length).toBe(3);

    // Advance round 2
    const round2Loser = round2!.eligibleLosers![0];
    result = tournamentEngine.luckyDrawAdvancement({
      participantId: round2Loser.participantId,
      roundNumber: 2,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // ── Round 3 ──
    completeRound(drawId, 3);

    status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round3 = status.rounds.find((r) => r.roundNumber === 3);
    expect(round3!.isComplete).toBe(true);
    expect(round3!.isPreFeedRound).toBe(false); // 2 matchUps = even
    expect(round3!.advancingWinners!.length).toBe(2);

    // Advance round 3 (non-pre-feed, no lucky loser needed)
    result = tournamentEngine.luckyDrawAdvancement({
      roundNumber: 3,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // ── Round 4 (Final) ──
    completeRound(drawId, 4);

    status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round4 = status.rounds.find((r) => r.roundNumber === 4);
    expect(round4!.isComplete).toBe(true);
  });

  test('drawSize 9: advancement clears stale BYE matchUpStatus on next-round matchUps', () => {
    // Regression: if a next-round matchUp had a stale BYE status (from old
    // auto-propagation code), luckyDrawAdvancement would assign new positions
    // but leave matchUpStatus: "BYE", making the matchUp unscoreable.
    const drawProfiles = [{ drawSize: 9, drawType: LUCKY_DRAW }];
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
    const structure = drawDefinition.structures[0];

    // Simulate stale BYE status on a next-round matchUp (as if old code ran)
    const r2MatchUp = structure.matchUps.find((m: any) => m.roundNumber === 2 && m.roundPosition === 1);
    r2MatchUp.matchUpStatus = BYE;
    r2MatchUp.drawPositions = [99, 100]; // fake stale positions
    // Add fake stale positionAssignment entries (no participantId)
    structure.positionAssignments.push({ drawPosition: 99 }, { drawPosition: 100 });
    tournamentEngine.setState(tournamentRecord);

    // Advance round 1
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r) => r.roundNumber === 1);
    const loser = round1!.eligibleLosers![0];
    const result = tournamentEngine.luckyDrawAdvancement({
      participantId: loser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // Verify: no R2 matchUp has BYE status
    const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
    const r2MatchUps = updated.structures[0].matchUps.filter((m: any) => m.roundNumber === 2);
    for (const m of r2MatchUps) {
      expect(m.matchUpStatus).not.toBe(BYE);
      // All R2 matchUps should have 2 drawPositions with participants
      expect(m.drawPositions?.length).toBe(2);
    }

    // Verify: no orphaned positionAssignment entries without participantId/bye
    const assignments = updated.structures[0].positionAssignments;
    const orphaned = assignments.filter((a: any) => !a.participantId && !a.bye);
    expect(orphaned.length).toBe(0);
  });

  test('drawSize 11: BYE in round 1 propagates correctly through subsequent rounds', () => {
    // drawSize 11 → 12 positions (1 BYE), round profile: [6, 3, 2, 1]
    // Round 1: 6 matchUps (even, NOT pre-feed), 1 BYE
    // Round 2: 3 matchUps (pre-feed)
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
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

    // Round 1: even matchUp count, not pre-feed
    let status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r) => r.roundNumber === 1);
    expect(round1!.matchUpsCount).toBe(6);
    expect(round1!.isComplete).toBe(true);
    expect(round1!.isPreFeedRound).toBe(false);

    // Advance round 1 (no lucky loser selection needed)
    let result = tournamentEngine.luckyDrawAdvancement({
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // Complete and check round 2
    completeRound(drawId, 2);

    status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round2 = status.rounds.find((r) => r.roundNumber === 2);

    expect(round2!.matchUpsCount).toBe(3);
    expect(round2!.isComplete).toBe(true);
    expect(round2!.isPreFeedRound).toBe(true);
    expect(round2!.needsLuckySelection).toBe(true);
    expect(round2!.eligibleLosers!.length).toBe(3);
  });

  test('drawSize 9: R2 positions do not collide with R1 BYE position', () => {
    // Regression: luckyDrawAdvancement computed maxPosition from participant-only
    // assignments, missing the BYE at dp 10. New R2 positions started at dp 10,
    // causing a BYE/participant collision that hid the advancing winner.
    const drawProfiles = [{ drawSize: 9, drawType: LUCKY_DRAW }];
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
    const structure = drawDefinition.structures[0];

    // Find the BYE position number
    const byeAssignment = structure.positionAssignments.find((a: any) => a.bye);
    expect(byeAssignment).toBeDefined();
    const byePosition = byeAssignment!.drawPosition;

    // Advance round 1
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r) => r.roundNumber === 1);
    const loser = round1!.eligibleLosers![0];
    const result = tournamentEngine.luckyDrawAdvancement({
      participantId: loser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // Verify: no R2 matchUp uses the BYE position number
    const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
    const updatedStructure = updated.structures[0];
    const r2MatchUps = updatedStructure.matchUps.filter((m: any) => m.roundNumber === 2);
    const r2Positions = r2MatchUps.flatMap((m: any) => m.drawPositions || []).filter(Boolean);

    expect(r2Positions).not.toContain(byePosition);

    // Verify: no position has both bye=true and participantId
    const assignments = updatedStructure.positionAssignments;
    for (const dp of r2Positions) {
      const entries = assignments.filter((a: any) => a.drawPosition === dp);
      const hasBye = entries.some((a: any) => a.bye);
      const hasParticipant = entries.some((a: any) => a.participantId);
      expect(hasBye && hasParticipant).toBe(false);
    }

    // Verify: all R2 matchUps have 2 participants assigned (no BYEs)
    for (const matchUp of r2MatchUps) {
      const dps = matchUp.drawPositions;
      expect(dps.length).toBe(2);
      for (const dp of dps) {
        const assignment = assignments.find((a: any) => a.drawPosition === dp && a.participantId);
        expect(assignment).toBeDefined();
      }
    }
  });

  test('drawSize 5: BYE matchUp in round 1 counts toward completion', () => {
    // drawSize 5 → 6 positions (1 BYE), round profile: [3, 2, 1]
    // Round 1: 3 matchUps (pre-feed), 1 BYE
    const drawProfiles = [{ drawSize: 5, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });
    tournamentEngine.setState(tournamentRecord);

    let status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r) => r.roundNumber === 1);

    // BYE matchUp should count toward completion
    expect(round1!.matchUpsCount).toBe(3);
    expect(round1!.isComplete).toBe(true);
    expect(round1!.isPreFeedRound).toBe(true);
    expect(round1!.needsLuckySelection).toBe(true);
    // 3 winners (2 scored + 1 BYE-advanced), 2 losers (BYE has no loser)
    expect(round1!.advancingWinners!.length).toBe(3);
    expect(round1!.eligibleLosers!.length).toBe(2);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    // Advance round 1
    const loser = round1!.eligibleLosers![0];
    let result = tournamentEngine.luckyDrawAdvancement({
      participantId: loser.participantId,
      roundNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // Complete and check round 2
    completeRound(drawId, 2);

    status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round2 = status.rounds.find((r) => r.roundNumber === 2);
    expect(round2!.isComplete).toBe(true);
    expect(round2!.advancingWinners!.length).toBe(2);
  });
});
