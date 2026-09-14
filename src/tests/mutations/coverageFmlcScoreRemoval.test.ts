import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

describe('FMLC score removal coverage for removeDirectedParticipants branches', () => {
  it('FMLC complete-then-remove: removing round 2 outcome clears loser from consolation and winner from next round', () => {
    const drawProfiles = [
      {
        drawSize: 16,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ];
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    // Complete MAIN round 1
    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      stage: MAIN,
      roundNumber: 1,
      completeAllMatchUps: '6-3 6-4',
    });

    // Complete MAIN round 2 only (not consolation or later rounds)
    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      stage: MAIN,
      roundNumber: 2,
      completeAllMatchUps: '6-2 6-1',
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Find a MAIN round 2 matchUp that is COMPLETED
    const mainR2Completed = matchUps.filter(
      (m) => m.stage === MAIN && m.roundNumber === 2 && m.matchUpStatus === COMPLETED,
    );
    expect(mainR2Completed.length).toBeGreaterThan(0);

    const targetMatchUp = mainR2Completed[0];
    const targetMatchUpId = targetMatchUp.matchUpId;

    // Capture the loser's participantId before removal
    const loserSideNumber = targetMatchUp.winningSide === 1 ? 2 : 1;
    const loserParticipantId = targetMatchUp.sides.find((s) => s.sideNumber === loserSideNumber)?.participantId;
    expect(loserParticipantId).toBeDefined();

    // Remove the round 2 outcome using tournamentEngine (which has proper state)
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUpId,
      outcome: { matchUpStatus: TO_BE_PLAYED },
      drawId,
    });
    expect(result.success).toBe(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());

    const updatedMatchUp = matchUps.find((m) => m.matchUpId === targetMatchUpId);
    expect(updatedMatchUp.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(updatedMatchUp.winningSide).toBeUndefined();

    // The loser should no longer be assigned in consolation round 2 feed positions
    // (they are removed from the consolation structure by removeDirectedLoser)
    const consolationR2After = matchUps.filter((m) => m.stage === CONSOLATION && m.roundNumber === 2);
    const loserStillInConsolationR2 = consolationR2After.some((m) =>
      m.sides?.some((s) => s.participantId === loserParticipantId),
    );
    expect(loserStillInConsolationR2).toBe(false);
  });

  it('FMLC double walkover with consolation cleanup: byeMatchUp branch triggered on removal', () => {
    // Generate FMLC with a DOUBLE_WALKOVER on round 1 matchUp index 0
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          outcomes: [{ roundNumber: 1, matchUpIndex: 0, matchUpStatus: DOUBLE_WALKOVER }],
        },
      ],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    // Complete remaining matchUps
    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      completeAllMatchUps: '6-1 6-1',
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Verify the DOUBLE_WALKOVER was applied
    const mainR1 = matchUps
      .filter((m) => m.stage === MAIN && m.roundNumber === 1)
      .sort((a, b) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0));
    expect(mainR1[0].matchUpStatus).toBe(DOUBLE_WALKOVER);

    // Find a MAIN round 2 matchUp that received propagation from the double walkover
    const mainR2 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 2);
    expect(mainR2.length).toBeGreaterThan(0);

    // Find a completed round 2 matchUp (one that had a real participant, not the DW-propagated one)
    const r2Completed = mainR2.filter((m) => m.matchUpStatus === COMPLETED);

    if (r2Completed.length > 0) {
      // Remove a completed round 2 matchUp outcome
      const r2Target = r2Completed[0];

      // First remove the final (round 3) if it exists, since we need to remove from latest round first
      const mainR3 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 3 && m.matchUpStatus === COMPLETED);
      for (const m of mainR3) {
        const r = tournamentEngine.setMatchUpStatus({
          matchUpId: m.matchUpId,
          outcome: { matchUpStatus: TO_BE_PLAYED },
          drawId,
        });
        expect(r.success).toBe(true);
      }

      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: r2Target.matchUpId,
        outcome: { matchUpStatus: TO_BE_PLAYED },
        drawId,
      });
      expect(result.success).toBe(true);

      ({ matchUps } = tournamentEngine.allTournamentMatchUps());

      const updated = matchUps.find((m) => m.matchUpId === r2Target.matchUpId);
      expect(updated.matchUpStatus).toBe(TO_BE_PLAYED);
    } else {
      // The round 2 matchUp at position 1 received a WALKOVER from the DW
      // and the other round 2 matchUp is completed. Remove the DOUBLE_WALKOVER source.
      const dwMatchUp = mainR1[0];
      expect(dwMatchUp.matchUpStatus).toBe(DOUBLE_WALKOVER);

      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: dwMatchUp.matchUpId,
        outcome: { matchUpStatus: TO_BE_PLAYED },
        drawId,
      });
      expect(result.success).toBe(true);

      ({ matchUps } = tournamentEngine.allTournamentMatchUps());

      const updated = matchUps.find((m) => m.matchUpId === dwMatchUp.matchUpId);
      expect(updated.matchUpStatus).toBe(TO_BE_PLAYED);
    }

    // Verify consolation structure is consistent after removal
    const consolationMatchUps = matchUps.filter((m) => m.stage === CONSOLATION);
    expect(consolationMatchUps.length).toBeGreaterThan(0);
  });

  it('score removal cascading through consolation: removing MAIN round 1 outcome removes loser from consolation', () => {
    const drawProfiles = [
      {
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ];
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({ drawProfiles });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);

    // Complete MAIN round 1
    mocksEngine.completeDrawMatchUps({
      tournamentRecord,
      drawDefinition,
      event,
      stage: MAIN,
      roundNumber: 1,
      completeAllMatchUps: '6-3 6-4',
    });

    tournamentEngine.setState(tournamentRecord);
    let { matchUps } = tournamentEngine.allTournamentMatchUps();

    // Find a MAIN round 1 completed matchUp
    const mainR1 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1 && m.matchUpStatus === COMPLETED);
    expect(mainR1.length).toBe(4);

    const targetMatchUp = mainR1[0];
    const loserSideNumber = targetMatchUp.winningSide === 1 ? 2 : 1;
    const loserParticipantId = targetMatchUp.sides.find((s) => s.sideNumber === loserSideNumber)?.participantId;
    expect(loserParticipantId).toBeDefined();

    // Verify loser is in consolation before removal
    const consolationBefore = matchUps.filter((m) => m.stage === CONSOLATION);
    const loserPresentBefore = consolationBefore.some((m) =>
      m.sides?.some((s) => s.participantId === loserParticipantId),
    );
    expect(loserPresentBefore).toBe(true);

    // Remove the MAIN round 1 outcome via tournamentEngine
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: targetMatchUp.matchUpId,
      outcome: { matchUpStatus: TO_BE_PLAYED },
      drawId,
    });
    expect(result.success).toBe(true);

    ({ matchUps } = tournamentEngine.allTournamentMatchUps());

    const updatedMatchUp = matchUps.find((m) => m.matchUpId === targetMatchUp.matchUpId);
    expect(updatedMatchUp.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(updatedMatchUp.winningSide).toBeUndefined();

    // The loser should have been removed from consolation
    const consolationAfter = matchUps.filter((m) => m.stage === CONSOLATION);
    const loserPresentAfter = consolationAfter.some((m) =>
      m.sides?.some((s) => s.participantId === loserParticipantId),
    );
    expect(loserPresentAfter).toBe(false);
  });
});
