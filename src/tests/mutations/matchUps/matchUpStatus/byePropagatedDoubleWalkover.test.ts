import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../../..';
import { expect, test } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

test('bye propagated double walkover hydration', () => {
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        participantsCount: 6,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 3,
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(result.tournamentRecord);

  result = tournamentEngine.allTournamentMatchUps({ inContext: true });

  const matchUp = result.matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1);
  expect(matchUp.sides[1].sideNumber).toEqual(2);
  expect(matchUp.sides.length).toEqual(2);
});

test('bye propagated double walkover in final has correct sideNumber', () => {
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 1,
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 2,
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 3,
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 4,
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 2,
            winningSide: 1,
            stage: CONSOLATION,
          },
          {
            roundNumber: 1,
            roundPosition: 1,
            matchUpStatus: DOUBLE_WALKOVER,
            stage: CONSOLATION,
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(result.tournamentRecord);

  result = tournamentEngine.allTournamentMatchUps({ inContext: true });

  const matchUp = result.matchUps.find((m) => m.stage === CONSOLATION && m.roundNumber === 3);
  expect(matchUp.winningSide).toEqual(2);
});
