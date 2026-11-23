import { generateTeamTournament } from '@Tests/mutations/participants/team/generateTestTeamTournament';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { INVALID_MATCHUP_STATUS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

it('can both assign and remove individualParticipants in SINGLES matchUps that are part of team events', () => {
  let matchUpModifications: any[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (result) => {
        matchUpModifications.push(result);
      },
    },
  });
  const { tournamentRecord, drawId } = generateTeamTournament({
    singlesCount: 6,
    doublesCount: 3,
    drawSize: 4,
  });
  tournamentEngine.setState(tournamentRecord);

  const {
    matchUps: [dualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
  expect(singlesMatchUps.length).toEqual(6);

  singlesMatchUps.slice(0, 3).forEach((singlesMatchUp) => {
    const { matchUpId } = singlesMatchUp;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
  expect(doublesMatchUps.length).toEqual(3);

  doublesMatchUps.slice(0, 1).forEach((doublesMatchUp) => {
    const { matchUpId } = doublesMatchUp;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // expect an error because no finishingOrder has been provided
  let result = tournamentEngine.setOrderOfFinish({ drawId });
  expect(result.error).toEqual(INVALID_VALUES);

  // attempt to assign orderOfFinish to all singlesMatchUps
  // expect an error because orderOfFinish value is 0
  let finishingOrder = singlesMatchUps.slice(0, 3).map(({ matchUpId }, index) => ({
    orderOfFinish: index,
    matchUpId,
  }));
  result = tournamentEngine.setOrderOfFinish({
    finishingOrder,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  // attempt to assign orderOfFinish to all singlesMatchUps
  // expect an error because not all singlesMatchUps have been completed
  finishingOrder = singlesMatchUps.map(({ matchUpId }, index) => ({
    orderOfFinish: index + 1,
    matchUpId,
  }));
  result = tournamentEngine.setOrderOfFinish({
    finishingOrder,
    drawId,
  });
  expect(result.error).toEqual(INVALID_MATCHUP_STATUS);

  // attempt to assign orderOfFinish to all tieMatchUps
  // expect an error because not all tieMatchUps are the same matchUpType
  finishingOrder = dualMatchUp.tieMatchUps.map(({ matchUpId }, index) => ({
    orderOfFinish: index + 1,
    matchUpId,
  }));
  result = tournamentEngine.setOrderOfFinish({
    finishingOrder,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  // attempt to assign orderOfFinish to all singlesMatchUps
  // expect failure because orderOfFinish values are not unique
  finishingOrder = singlesMatchUps.slice(0, 3).map(({ matchUpId }) => ({
    orderOfFinish: 1,
    matchUpId,
  }));
  result = tournamentEngine.setOrderOfFinish({
    finishingOrder,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  matchUpModifications = [];
  // attempt to assign orderOfFinish to all singlesMatchUps
  finishingOrder = singlesMatchUps.slice(0, 3).map(({ matchUpId }, index) => ({
    orderOfFinish: index + 1,
    matchUpId,
  }));
  result = tournamentEngine.setOrderOfFinish({
    finishingOrder,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUpIds = singlesMatchUps.map(({ matchUpId }) => matchUpId);
  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpIds } }).matchUps;
  expect(matchUps.map(({ orderOfFinish }) => orderOfFinish)).toEqual([1, 2, 3, undefined, undefined, undefined]);
  expect(matchUpModifications.length).toEqual(1);
  expect(matchUpModifications.flat(Infinity).length).toEqual(3);
});
