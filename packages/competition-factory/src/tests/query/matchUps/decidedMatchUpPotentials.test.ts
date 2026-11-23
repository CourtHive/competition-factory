import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

// A matchUp that is decided (or is a BYE) has already placed whoever it sends on. Hydration listed every participant
// of such a matchUp as a potential participant of its loser target: the player a BYE advanced, and both players of a
// completed FMLC matchUp whose loser the consolation keeps out. Scheduling read those as people who might play there.

const startDate = '2024-01-15';
const endDate = '2024-01-20';

const potentialIds = (matchUp) =>
  (matchUp?.potentialParticipants ?? []).flat().map(({ participantId }) => participantId);

it('a participant advanced by a BYE is not a potential participant of the BYE matchUp loser target', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, drawType: FEED_IN_CHAMPIONSHIP }],
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
  const byeMatchUps = matchUps.filter(
    (matchUp) => matchUp.stage === MAIN && matchUp.roundNumber === 1 && matchUp.matchUpStatus === BYE,
  );
  expect(byeMatchUps.length).toEqual(2);

  for (const byeMatchUp of byeMatchUps) {
    const advancedId = byeMatchUp.sides.find((side) => side.participantId)?.participantId;
    const loserTarget = matchUps.find((matchUp) => matchUp.matchUpId === byeMatchUp.loserMatchUpId);
    expect(advancedId).toBeDefined();
    expect(loserTarget).toBeDefined();
    expect(potentialIds(loserTarget)).not.toContain(advancedId);
  }
});

it('neither player of a completed FMLC R2 matchUp is a potential consolation participant', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        outcomes: [
          { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
          { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-1', winningSide: 1 },
          { roundNumber: 2, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
        ],
        drawSize: 8,
      },
    ],
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true });
  const secondRound = matchUps.find(
    (matchUp) => matchUp.stage === MAIN && matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );
  const loserTarget = matchUps.find((matchUp) => matchUp.matchUpId === secondRound.loserMatchUpId);
  expect(loserTarget).toBeDefined();

  // the winner went on to the main final; the loser had already played a matchUp, so the consolation keeps them out
  const playerIds = secondRound.sides.map(({ participantId }) => participantId);
  expect(playerIds.length).toEqual(2);
  for (const participantId of playerIds) expect(potentialIds(loserTarget)).not.toContain(participantId);
});
