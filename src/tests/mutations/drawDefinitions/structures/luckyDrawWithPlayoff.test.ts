import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, describe } from 'vitest';

// constants
import { LUCKY_DRAW, PLAY_OFF } from '@Constants/drawDefinitionConstants';

/**
 * End-to-end test: 10-participant lucky draw → complete round 1 → add playoff → select lucky participant
 * Verifies that discarded losers are automatically placed into the playoff structure.
 */
describe('lucky draw with playoff structure — end-to-end', () => {
  test('10 participants: discarded losers are placed into playoff after lucky selection', () => {
    // 1. Generate tournament with 10 participants in a lucky draw, round 1 completed
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      completeAllMatchUps: true,
      drawProfiles,
    });

    tournamentEngine.setState(tournamentRecord);

    // Get draw info
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === 'MAIN');
    const mainStructureId = mainStructure.structureId;

    // Verify round 1 status: pre-feed round, needs lucky selection
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1).toBeDefined();
    expect(round1!.isPreFeedRound).toBe(true);
    expect(round1!.isComplete).toBe(true);
    expect(round1!.needsLuckySelection).toBe(true);
    expect(round1!.eligibleLosers!.length).toBe(5);
    expect(round1!.advancingWinners!.length).toBe(5);

    // 2. Check available playoff profiles for the main structure
    const { playoffRoundsRanges } = tournamentEngine.getAvailablePlayoffProfiles({
      structureId: mainStructureId,
      drawId,
    });
    expect(playoffRoundsRanges).toBeDefined();
    expect(playoffRoundsRanges.length).toBeGreaterThan(0);

    // Round 1 should be available for playoff (losers from round 1)
    const round1Playoff = playoffRoundsRanges.find((r: any) => r.roundNumber === 1);
    expect(round1Playoff).toBeDefined();

    // 3. Add playoff structure for round 1 losers
    const addResult = tournamentEngine.addPlayoffStructures({
      structureId: mainStructureId,
      roundNumbers: [1],
      playoffStructureNameBase: 'Playoff',
      drawId,
    });
    expect(addResult.success).toBe(true);

    // Verify playoff structure was created
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const playoffStructures = updatedDraw.structures.filter((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toBeGreaterThan(0);

    const playoffStructure = playoffStructures[0];

    // Verify a LOSER link was created from main round 1 to the playoff
    const loserLink = updatedDraw.links.find(
      (link: any) =>
        link.linkType === 'LOSER' &&
        link.source.structureId === mainStructureId &&
        link.source.roundNumber === 1 &&
        link.target.structureId === playoffStructure.structureId,
    );
    expect(loserLink).toBeDefined();

    // At this point, no losers should be placed in the playoff yet
    // (directParticipants skips loser direction for lucky draw pre-feed rounds)
    const playoffAssignmentsBefore = playoffStructure.positionAssignments?.filter(
      (a: any) => a.participantId,
    );
    expect(playoffAssignmentsBefore?.length || 0).toBe(0);

    // 4. Select the lucky participant (first eligible loser = closest match)
    const selectedLoser = round1!.eligibleLosers![0];
    const discardedLoserIds = round1!.eligibleLosers!
      .filter((l: any) => l.participantId !== selectedLoser.participantId)
      .map((l: any) => l.participantId);
    expect(discardedLoserIds.length).toBe(4);

    const advanceResult = tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      structureId: mainStructureId,
      roundNumber: 1,
      drawId,
    });
    expect(advanceResult.success).toBe(true);

    // 5. Verify discarded losers are placed in the playoff structure
    const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });
    const finalPlayoff = finalDraw.structures.find(
      (s: any) => s.structureId === playoffStructure.structureId,
    );
    expect(finalPlayoff).toBeDefined();

    const playoffAssignments = finalPlayoff.positionAssignments?.filter((a: any) => a.participantId) || [];
    const playoffParticipantIds = playoffAssignments.map((a: any) => a.participantId);

    // All 4 discarded losers should be placed
    for (const loserId of discardedLoserIds) {
      expect(playoffParticipantIds).toContain(loserId);
    }

    // The selected lucky loser should NOT be in the playoff
    expect(playoffParticipantIds).not.toContain(selectedLoser.participantId);

    // Playoff matchUps should have draw positions assigned
    const playoffMatchUps = finalPlayoff.matchUps?.filter((m: any) => m.roundNumber === 1) || [];
    expect(playoffMatchUps.length).toBeGreaterThan(0);
    for (const matchUp of playoffMatchUps) {
      expect(matchUp.drawPositions).toBeDefined();
      expect(matchUp.drawPositions.length).toBe(2);
      expect(matchUp.drawPositions.every(Boolean)).toBe(true);
    }
  });

  test('playoff losers can be scored after placement', () => {
    // Generate and complete round 1
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
    const mainStructureId = drawDefinition.structures[0].structureId;

    // Add playoff
    tournamentEngine.addPlayoffStructures({
      structureId: mainStructureId,
      roundNumbers: [1],
      playoffStructureNameBase: 'Playoff',
      drawId,
    });

    // Advance with lucky selection
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    const selectedLoser = round1!.eligibleLosers![0];

    tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      structureId: mainStructureId,
      roundNumber: 1,
      drawId,
    });

    // Re-fetch draw after advancement to get current state
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });
    const playoffStructure = finalDraw.structures.find((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructure).toBeDefined();

    const playoffMatchUps = matchUps.filter(
      (m: any) => m.structureId === playoffStructure.structureId && m.roundNumber === 1,
    );

    expect(playoffMatchUps.length).toBeGreaterThan(0);

    // Playoff matchUps should have sides with participants populated
    const scorableMatchUps = playoffMatchUps.filter(
      (m: any) => m.sides?.length === 2 && m.sides.every((s: any) => s.participantId),
    );
    expect(scorableMatchUps.length).toBe(playoffMatchUps.length);

    // Verify no duplicate positionAssignment entries
    const positionCounts: Record<number, number> = {};
    for (const pa of playoffStructure.positionAssignments || []) {
      positionCounts[pa.drawPosition] = (positionCounts[pa.drawPosition] || 0) + 1;
    }
    const duplicates = Object.entries(positionCounts).filter(([, count]) => count > 1);
    expect(duplicates.length).toBe(0);

    // Score the first playoff matchUp
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: 'COMPLETED',
      scoreString: '6-3 6-4',
      winningSide: 1,
    });

    const scoreResult = tournamentEngine.setMatchUpStatus({
      matchUpId: scorableMatchUps[0].matchUpId,
      outcome,
      drawId,
    });
    expect(scoreResult.success).toBe(true);
  });

  test('playoff added before round 1 is scored — losers placed after advancement', () => {
    // 1. Generate tournament with 10 participants, NO scores yet
    const drawProfiles = [{ drawSize: 10, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures[0].structureId;

    // 2. Add playoff structure BEFORE scoring round 1
    const addResult = tournamentEngine.addPlayoffStructures({
      structureId: mainStructureId,
      roundNumbers: [1],
      playoffStructureNameBase: 'Playoff',
      drawId,
    });
    expect(addResult.success).toBe(true);

    // 3. Score all round 1 matchUps
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const round1MatchUps = matchUps.filter(
      (m: any) => m.roundNumber === 1 && m.structureId === mainStructureId,
    );
    expect(round1MatchUps.length).toBe(5);

    for (const matchUp of round1MatchUps) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        matchUpStatus: 'COMPLETED',
        scoreString: '6-3 6-4',
        winningSide: 1,
      });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toBe(true);
    }

    // 4. Verify round 1 needs lucky selection
    const status = tournamentEngine.getLuckyDrawRoundStatus({ drawId });
    const round1 = status.rounds.find((r: any) => r.roundNumber === 1);
    expect(round1!.needsLuckySelection).toBe(true);
    expect(round1!.eligibleLosers!.length).toBe(5);

    const selectedLoser = round1!.eligibleLosers![0];
    const discardedLoserIds = round1!.eligibleLosers!
      .filter((l: any) => l.participantId !== selectedLoser.participantId)
      .map((l: any) => l.participantId);

    // 5. Select lucky participant
    const advanceResult = tournamentEngine.luckyDrawAdvancement({
      participantId: selectedLoser.participantId,
      structureId: mainStructureId,
      roundNumber: 1,
      drawId,
    });
    expect(advanceResult.success).toBe(true);

    // 6. Verify discarded losers are in the playoff
    const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });
    const playoffStructure = finalDraw.structures.find((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructure).toBeDefined();

    const playoffParticipantIds = (playoffStructure.positionAssignments || [])
      .filter((a: any) => a.participantId)
      .map((a: any) => a.participantId);

    for (const loserId of discardedLoserIds) {
      expect(playoffParticipantIds).toContain(loserId);
    }
    expect(playoffParticipantIds).not.toContain(selectedLoser.participantId);
  });

  test('drawSize 11: add 8-12 playoff generates matchUps', () => {
    // drawSize 11 LUCKY_DRAW has rounds [6, 3, 2, 1]
    // Round 1 losers have finishingPositions 8-12
    const drawProfiles = [{ drawSize: 11, drawType: LUCKY_DRAW }];
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === 'MAIN');
    const mainStructureId = mainStructure.structureId;

    // Verify available playoff profiles include round 1
    const { playoffRoundsRanges } = tournamentEngine.getAvailablePlayoffProfiles({
      structureId: mainStructureId,
      drawId,
    });
    expect(playoffRoundsRanges).toBeDefined();
    const round1Range = playoffRoundsRanges.find((r: any) => r.roundNumber === 1);
    expect(round1Range).toBeDefined();
    expect(round1Range.finishingPositions).toEqual([8, 9, 10, 11, 12]);

    // Add playoff structure for round 1 losers (positions 8-12)
    const addResult = tournamentEngine.addPlayoffStructures({
      playoffStructureNameBase: 'Playoff 8-12',
      structureId: mainStructureId,
      roundNumbers: [1],
      drawId,
    });
    expect(addResult.success).toBe(true);

    // Verify playoff structure was created with matchUps
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const playoffStructures = updatedDraw.structures.filter((s: any) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toBeGreaterThan(0);

    const playoffStructure = playoffStructures[0];
    expect(playoffStructure.matchUps).toBeDefined();
    expect(playoffStructure.matchUps.length).toBeGreaterThan(0);

    // Verify a LOSER link was created
    const loserLink = updatedDraw.links.find(
      (link: any) =>
        link.linkType === 'LOSER' &&
        link.source.structureId === mainStructureId &&
        link.source.roundNumber === 1 &&
        link.target.structureId === playoffStructure.structureId,
    );
    expect(loserLink).toBeDefined();
  });
});
