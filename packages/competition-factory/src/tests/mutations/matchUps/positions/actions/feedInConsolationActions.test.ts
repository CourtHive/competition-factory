import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { ADD_PENALTY } from '@Constants/positionActionConstants';
import { SCORE } from '@Constants/matchUpActionConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

it('can modify score for main draw match after loser directed to consolation', () => {
  const participantsProfile = {
    participantsCount: 16,
    participantType: PAIR,
  };
  const drawProfiles = [
    {
      drawSize: 16,
      eventType: DOUBLES,
      participantsCount: 16,
      drawType: FEED_IN_CHAMPIONSHIP,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 5,
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 6,
          scoreString: '6-1 7-5',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 7,
          scoreString: '6-1 7-6(6)',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 8,
          scoreString: '6-1 7-6(7)',
          winningSide: 1,
        },
        // 2nd round main draw
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 3,
          scoreString: '6-2 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 4,
          scoreString: '6-2 6-4',
          winningSide: 1,
        },
        // 3rd round main draw
        {
          roundNumber: 3,
          roundPosition: 1,
          scoreString: '6-3 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 3,
          roundPosition: 2,
          scoreString: '6-3 6-2',
          winningSide: 1,
        },
        // 1st round consolation draw
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-1 6-1',
          winningSide: 1,
          stage: CONSOLATION,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
          winningSide: 1,
          stage: CONSOLATION,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
          stage: CONSOLATION,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
          stage: CONSOLATION,
        },
        // 2nd round consolation draw
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
          stage: CONSOLATION,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-2',
          winningSide: 1,
          stage: CONSOLATION,
        },
        {
          roundNumber: 2,
          roundPosition: 3,
          scoreString: '6-2 6-3',
          winningSide: 1,
          stage: CONSOLATION,
        },
        {
          roundNumber: 2,
          roundPosition: 4,
          scoreString: '6-2 6-4',
          winningSide: 1,
          stage: CONSOLATION,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({
    inContext: true,
    drawId,
  });

  const targetMatchUp = matchUps.find(
    ({ roundNumber, roundPosition, stage }) => roundNumber === 3 && roundPosition === 1 && stage === CONSOLATION,
  );
  const { drawPositions, matchUpId, structureId } = targetMatchUp;

  result = tournamentEngine.matchUpActions({ drawId, matchUpId });
  expect(result.validActions.map(({ type }) => type).includes(SCORE)).toEqual(true);

  result = tournamentEngine.positionActions({
    drawPosition: drawPositions[0],
    structureId,
    drawId,
  });
  expect(result.validActions.map(({ type }) => type).includes(ADD_PENALTY)).toEqual(true);
});
