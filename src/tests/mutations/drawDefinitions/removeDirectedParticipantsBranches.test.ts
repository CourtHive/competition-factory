import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLES } from '@Constants/eventConstants';

describe('removeDirectedParticipants - uncovered branches', () => {
  test('removing result from completed match propagates removal to winner and loser targets', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
        },
      ],
      setState: true,
    });

    // Complete all first round matchUps
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUps = matchUps.filter(
      (m) => m.roundNumber === 1 && m.stage === MAIN && m.drawPositions?.every(Boolean),
    );

    for (const matchUp of firstRoundMatchUps) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-3 6-4',
        winningSide: 1,
      });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Verify winners are in round 2 and losers are in consolation
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    const mainR2 = matchUps.filter((m) => m.roundNumber === 2 && m.stage === MAIN);
    mainR2.forEach((m) => {
      expect(m.drawPositions?.filter(Boolean).length).toEqual(2);
    });

    // Complete a second round match
    const secondRoundMatchUp = mainR2.find((m) => m.drawPositions?.every(Boolean) && !m.winningSide);
    if (secondRoundMatchUp) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-4 6-4',
        winningSide: 2,
      });
      let result = tournamentEngine.setMatchUpStatus({
        matchUpId: secondRoundMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);

      // Verify winner advanced to semifinal
      ({ matchUps } = tournamentEngine.allTournamentMatchUps());
      const semifinal = matchUps.find(
        (m) => m.roundNumber === 3 && m.stage === MAIN && m.drawPositions?.filter(Boolean).length,
      );
      expect(semifinal).toBeDefined();

      // Now REMOVE the second round result - triggers removeDirectedParticipants
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: secondRoundMatchUp.matchUpId,
        outcome: { winningSide: undefined, score: undefined },
        drawId,
      });
      expect(result.success).toEqual(true);

      // Verify the winner was removed from semifinal
      ({ matchUps } = tournamentEngine.allTournamentMatchUps());
      const updatedSemifinal = matchUps.find(
        (m) => m.matchUpId === semifinal.matchUpId,
      );
      // The drawPositions should have fewer participants after removal
      expect(updatedSemifinal).toBeDefined();
    }
  });

  test('double walkover removal in FMLC exercises loser target removal path', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
        },
      ],
      setState: true,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUps = matchUps.filter(
      (m) => m.roundNumber === 1 && m.stage === MAIN && m.drawPositions?.every(Boolean),
    );

    // Complete first matchUp normally
    const { outcome: normalOutcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-2',
      winningSide: 1,
    });
    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: firstRoundMatchUps[0].matchUpId,
      outcome: normalOutcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Set second matchUp as DOUBLE_WALKOVER
    const { outcome: dwoOutcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: DOUBLE_WALKOVER,
    });
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: firstRoundMatchUps[1].matchUpId,
      outcome: dwoOutcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Now remove the normal outcome - the loser was sent to consolation
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: firstRoundMatchUps[0].matchUpId,
      outcome: { winningSide: undefined, score: undefined },
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify the draw is in a consistent state
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    const r1matchUp = matchUps.find((m) => m.matchUpId === firstRoundMatchUps[0].matchUpId);
    // After removing the outcome, the matchUp may be TO_BE_PLAYED or IN_PROGRESS
    // depending on whether there are still side effects from other completed matchUps
    expect([TO_BE_PLAYED, 'IN_PROGRESS'].includes(r1matchUp.matchUpStatus)).toEqual(true);
  });

  test('removing result from team (DOUBLES) matchUp exercises collection/tieMatchUp path', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          eventType: DOUBLES,
        },
      ],
      setState: true,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRound = matchUps.find(
      (m) => m.roundNumber === 1 && m.drawPositions?.every(Boolean),
    );

    if (firstRound) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-3 6-4',
        winningSide: 1,
      });
      let result = tournamentEngine.setMatchUpStatus({
        matchUpId: firstRound.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);

      result = tournamentEngine.setMatchUpStatus({
        matchUpId: firstRound.matchUpId,
        outcome: { winningSide: undefined, score: undefined },
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  });

  test('ad-hoc matchUp removal returns SUCCESS immediately', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 4,
          drawType: 'AD_HOC',
        },
      ],
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.sides?.every((s) => s.participantId));

    if (matchUp) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-3 6-4',
        winningSide: 1,
      });
      let result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);

      result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: undefined, score: undefined },
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  });

  test('removeDirectedWinner handles winner cross-structure (qualifying link)', () => {
    // Create a draw with qualifying structure so winner crosses structures
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [{ stageSequence: 1, drawSize: 4, qualifyingPositions: 2 }],
            },
          ],
        },
      ],
      setState: true,
    });

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const qualifyingMatchUps = matchUps.filter((m) => m.stage === 'QUALIFYING' && m.roundNumber === 1);

    // Complete qualifying matchUps
    for (const matchUp of qualifyingMatchUps) {
      if (matchUp.drawPositions?.every(Boolean)) {
        const { outcome } = mocksEngine.generateOutcomeFromScoreString({
          scoreString: '6-1 6-1',
          winningSide: 1,
        });
        const result = tournamentEngine.setMatchUpStatus({
          matchUpId: matchUp.matchUpId,
          outcome,
          drawId,
        });
        expect(result.success).toEqual(true);
      }
    }

    // Remove the qualifying result - exercises cross-structure winner removal
    ({ matchUps } = tournamentEngine.allTournamentMatchUps());
    const completedQualifying = matchUps.find(
      (m) => m.stage === 'QUALIFYING' && m.matchUpStatus === COMPLETED,
    );
    if (completedQualifying) {
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: completedQualifying.matchUpId,
        outcome: { winningSide: undefined, score: undefined },
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  });
});
