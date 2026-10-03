import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP } from '@Constants/topicConstants';
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  INVALID_MATCHUP,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';

// reusable
test('can clear TEAM matchUp "scorecards"', () => {
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
  const firstMatchUpTieMatchUpScoringLog: any[] = [];
  const firstMatchUpScoringLog: string[] = [];
  const modifiedMatchUpLog: any[] = [];

  let trackMatchUpModifications = false;
  let matchUpId = '';

  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        if (trackMatchUpModifications) {
          matchUps.forEach(({ matchUp }) => modifiedMatchUpLog.push({ [matchUp.matchUpId]: matchUp.score }));
        }
      },
      [MODIFY_DRAW_DEFINITION]: (result) => {
        const targetMatchUp = result[0].drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === matchUpId);
        if (targetMatchUp) {
          firstMatchUpScoringLog.push(targetMatchUp.score.scoreStringSide1);
          firstMatchUpTieMatchUpScoringLog.push(targetMatchUp.tieMatchUps.map((t) => t.score));
        }
      },
    },
  });
  expect(result.success).toEqual(true);

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: USTA_GOLD_TEAM_CHALLENGE, eventType: TEAM, drawSize: 4 }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  // USTA_GOLD_TEAM_CHALLENGE plays its singles SET3-S:6/TB7 and its doubles SET1-S:8/TB7@7
  const lineOutcome = (matchUpId: string) => {
    const { matchUpFormat } = tournamentEngine.findMatchUp({ matchUpId, inContext: true }).matchUp;
    const scoreString = matchUpFormat.startsWith('SET1-S:8') ? '8-1' : '6-1 6-1';
    return mocksEngine.generateOutcomeFromScoreString({ matchUpFormat, scoreString, winningSide: 1 }).outcome;
  };

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.length).toEqual(2);
  matchUpId = firstRoundDualMatchUps[0].matchUpId;

  // for all first round dualMatchUps complete all doubles matchUps
  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    dualMatchUp.tieMatchUps.slice(0, 9).forEach((matchUp) => {
      const { matchUpId } = matchUp;
      const result = tournamentEngine.setMatchUpStatus({
        outcome: lineOutcome(matchUpId),
        matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
  });

  ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));
  let targetMatchUp = firstRoundDualMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  expect(targetMatchUp.score.sets[0].side1Score).toEqual(9);

  firstRoundDualMatchUps.forEach((dualMatchUp) => {
    const { winningSide, matchUpStatus, score, tieMatchUps } = dualMatchUp;
    expect(matchUpStatus).toEqual(COMPLETED);
    expect(tieMatchUps.length).toEqual(16);
    expect(winningSide).toEqual(1);
    expect(score).toEqual({
      scoreStringSide1: '9-0',
      scoreStringSide2: '0-9',
      sets: [{ side1Score: 9, side2Score: 0, winningSide: 1 }],
    });
  });

  let {
    matchUps: [secondRoundDualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });
  expect(secondRoundDualMatchUp.drawPositions).toEqual([1, 3]);

  result = tournamentEngine.resetScorecard({
    tiebreakReset: true,
    drawId,
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);

  result = tournamentEngine.resetScorecard({
    tiebreakReset: true,
    matchUpId: {},
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.resetScorecard({
    tiebreakReset: true,
    matchUpId: 'bogus',
    drawId,
  });
  expect(result.error).toEqual(MATCHUP_NOT_FOUND);

  const tieMatchUpId = firstRoundDualMatchUps[0].tieMatchUps[0].matchUpId;

  result = tournamentEngine.resetScorecard({
    matchUpId: tieMatchUpId,
    tiebreakReset: true,
    drawId,
  });
  expect(result.error).toEqual(INVALID_MATCHUP);

  result = tournamentEngine.resetScorecard({
    tiebreakReset: true,
    matchUpId,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);

  trackMatchUpModifications = true;
  result = tournamentEngine.resetScorecard({
    tiebreakReset: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  modifiedMatchUpLog.forEach((log) => {
    const values: any = Object.values(log).filter(Boolean);
    if (values.length) {
      expect(values.length).toEqual(1);
      expect(values[0].scoreStringSide1).toEqual('');
    }
  });

  // prettier-ignore
  expect(firstMatchUpScoringLog).toEqual([
    // result of iteratively scoring tieMatchUps for roundNumber: 1, roundPosition: 1
    '1-0', '2-0', '3-0', '4-0', '5-0', '6-0', '7-0', '8-0', '9-0',
    // result of iteratively scoring tieMatchUps for roundNumber: 1, roundPosition: 2
    '9-0', '9-0', '9-0', '9-0', '9-0', '9-0', '9-0', '9-0', '9-0',
    // result of resetScoreCard
    '',
  ]);

  // check that after the calling resetScorecard all tieMatchUps have no score
  const finalTieMatchUpScores = firstMatchUpTieMatchUpScoringLog.pop();
  expect(finalTieMatchUpScores.filter(({ sets }) => sets)).toEqual([]);

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }).matchUps;

  targetMatchUp = firstRoundDualMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

  expect(targetMatchUp.score.scoreStringSide1).toBeUndefined();

  ({
    matchUps: [secondRoundDualMatchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  }));
  expect(secondRoundDualMatchUp.drawPositions).toEqual([3]);
});
