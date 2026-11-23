import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

it('supports first loss after receiving WALKVOER or DEFAULT in first round', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        drawSize: 8,
        outcomes: [
          {
            roundPosition: 1,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            matchUpStatus: WALKOVER,
            roundPosition: 2,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            roundPosition: 3,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            matchUpStatus: DEFAULTED,
            roundPosition: 4,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            roundPosition: 1,
            roundNumber: 2,
            winningSide: 1,
          },
          {
            roundPosition: 2,
            roundNumber: 2,
            winningSide: 1,
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const fedMatchUps = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter(({ stage, roundNumber }) => stage === CONSOLATION && roundNumber === 2);

  const fedSides = fedMatchUps.flatMap(({ sides }) => sides).filter(({ drawPosition }) => drawPosition);
  expect(fedSides.length).toEqual(2);
  const fedParticpantsPresent = fedSides.every((side) => side.participantFed && side.participant);

  expect(fedParticpantsPresent).toEqual(true);
});
