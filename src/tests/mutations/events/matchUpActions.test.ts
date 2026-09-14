import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { END, PENALTY, REFEREE, SCHEDULE, SCORE, START, STATUS } from '@Constants/matchUpActionConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SINGLES } from '@Constants/eventConstants';
import { FEMALE } from '@Constants/genderConstants';

it('can return valid actions for matchUps', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
    sex: FEMALE,
  };
  const drawProfiles = [
    {
      drawSize: 16,
      eventType: SINGLES,
      participantsCount: 14,
      drawType: ELIMINATION,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    participantsProfile,
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });

  let matchUp = matchUps[0];
  expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  let { validActions } = tournamentEngine.matchUpActions(matchUp);
  let actionTypes = validActions.map((action) => action.type);
  const overlap = intersection(actionTypes, [REFEREE, SCORE, PENALTY, START, END]);
  expect(overlap.length).toEqual(5);

  matchUp = matchUps[1];
  expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  ({ validActions } = tournamentEngine.matchUpActions(matchUp));
  actionTypes = validActions.map((action) => action.type);
  expect(actionTypes.includes(SCHEDULE)).toEqual(true);
  expect(actionTypes.includes(STATUS)).toEqual(true);

  matchUp = matchUps[10];
  expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  ({ validActions } = tournamentEngine.matchUpActions(matchUp));
  actionTypes = validActions.map((action) => action.type);
  expect(actionTypes.includes(SCHEDULE)).toEqual(true);
  expect(actionTypes.includes(REFEREE)).toEqual(true);
  expect(actionTypes.includes(STATUS)).toEqual(false);
});

it('can score a matchUp using params provided in validActions', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });

  const drawPosition = 3;
  const targetMatchUp = matchUps.find(
    (matchUp) => matchUp.drawPositions.includes(drawPosition) && matchUp.roundNumber === 1,
  );
  const { validActions } = tournamentEngine.matchUpActions(targetMatchUp);
  const scoreAction = validActions.find(({ type }) => type === SCORE);
  const { method, payload } = scoreAction;

  const { outcome } = generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    winningSide: 2,
  });

  Object.assign(payload, { outcome });

  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));

  const updatedMatchUp = matchUps.find(({ matchUpId }) => matchUpId === targetMatchUp.matchUpId);
  expect(updatedMatchUp.winningSide).toEqual(2);
});
