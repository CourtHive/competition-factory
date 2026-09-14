import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../../..';
import { expect, test } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

test('Consolation WO/WO advancing fed BYE', () => {
  // prettier-ignore
  const outcomes = [
    { drawPositions: [1, 2], scoreString: '6-1 6-2', winningSide: 1 },
    { drawPositions: [3, 4], scoreString: '6-1 6-2', winningSide: 1 },
    { drawPositions: [5, 6], scoreString: '6-1 6-2', winningSide: 1 },
    { drawPositions: [7, 8], scoreString: '6-1 6-2', winningSide: 1 },
    { stage: CONSOLATION, scoreString: '6-1 6-2', winningSide: 1 },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, outcomes }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { completedMatchUps, upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(5);

  const targetMatchUp = upcomingMatchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === CONSOLATION && roundNumber === 1 && roundPosition === 2,
  );
  expect(targetMatchUp.drawPositions).toEqual([7, 8]);
  const bothSidesAsigned = targetMatchUp.sides.every((side) => side.participant);
  expect(bothSidesAsigned).toEqual(true);
  expect(targetMatchUp.readyToScore).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      matchUpStatuses: [DOUBLE_WALKOVER, WALKOVER, BYE],
      stages: [CONSOLATION],
    },
  });
  expect(matchUps.length).toEqual(2);
  expect(matchUps.map(({ roundPosition }) => roundPosition)).toEqual([1, 2]);

  const { matchUpId, drawId } = targetMatchUp;
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      matchUpStatuses: [DOUBLE_WALKOVER, WALKOVER, BYE],
      stages: [CONSOLATION],
    },
  }));
  expect(matchUps.map(({ matchUpStatus }) => matchUpStatus).sort()).toEqual([
    'BYE',
    'DOUBLE_WALKOVER',
    'WALKOVER',
    'WALKOVER',
  ]);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [CONSOLATION],
      roundNumbers: [4],
    },
  }));

  const advancedSide = matchUps[0].sides.find(getParticipantId);
  expect(advancedSide.drawPosition).toEqual(5);
});
