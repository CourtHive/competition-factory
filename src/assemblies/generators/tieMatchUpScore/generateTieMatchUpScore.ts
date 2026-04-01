import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getGroupValueGroups } from '@Query/hierarchical/tieFormats/getGroupValueGroups';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { evaluateCollectionResult } from './evaluateCollectionResult';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { INVALID_VALUES, MISSING_MATCHUP, MISSING_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure, TieFormat } from '@Types/tournamentTypes';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ResultType, MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * Calculates the number of wins per side and winningSide. When provided with `sideAdjustments`
 * will calculate prjected score and winningSide which is necessary for checking validity of score
 */

type TieMatchUpScore = {
  scoreStringSide1?: string;
  scoreStringSide2?: string;
  winningSide?: number;
  set?: any;
};

type GenerateTieMatchUpScoreArgs = {
  sideAdjustments?: [number, number];
  drawDefinition?: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  matchUp: HydratedMatchUp;
  structure?: Structure;
  tieFormat?: TieFormat;
  separator?: string;
  event?: Event;
};

export function generateTieMatchUpScore(params: GenerateTieMatchUpScoreArgs): TieMatchUpScore & ResultType {
  const {
    sideAdjustments = [0, 0], // currently unused?
    separator = '-',
    drawDefinition,
    matchUpsMap,
    structure,
    matchUp,
    event,
  } = params;

  if (
    !Array.isArray(sideAdjustments) ||
    sideAdjustments.length !== 2 ||
    Number.isNaN(sideAdjustments.reduce((a, b) => a + b))
  ) {
    return { error: INVALID_VALUES };
  }

  if (!matchUp) return { error: MISSING_MATCHUP };
  const tieFormat = resolveTieFormat({ matchUp, drawDefinition, structure, event })?.tieFormat || params?.tieFormat;

  if (!tieFormat) return { error: MISSING_TIE_FORMAT };

  const result = validateTieFormat({ tieFormat });
  if (result.error) return result;

  const sideTieValues = calculateSideTieValues(tieFormat, matchUp);

  const sideScores = sideTieValues.map((sideTieValue, i) => (sideTieValue || 0) + sideAdjustments[i]);

  const set = {
    side1Score: sideScores[0],
    side2Score: sideScores[1],
    winningSide: undefined,
  };
  const scoreStringSide1 = sideScores.join(separator);
  const scoreStringSide2 = sideScores.slice().reverse().join(separator);

  const winningSide = determineWinningSide({
    drawDefinition,
    matchUpsMap,
    sideScores,
    tieFormat,
    matchUp,
  });

  if (winningSide) set.winningSide = winningSide;

  return {
    scoreStringSide1,
    scoreStringSide2,
    winningSide,
    set,
  };
}

function calculateSideTieValues(tieFormat, matchUp) {
  const collectionDefinitions = tieFormat?.collectionDefinitions || [];
  const tieMatchUps = matchUp?.tieMatchUps ?? [];
  const sideTieValues = [0, 0];

  const { groupValueGroups, groupValueNumbers } = getGroupValueGroups(tieFormat);

  for (const collectionDefinition of collectionDefinitions) {
    evaluateCollectionResult({
      collectionDefinition,
      groupValueNumbers,
      groupValueGroups,
      sideTieValues,
      tieMatchUps,
    });
  }

  for (const groupNumber of groupValueNumbers) {
    const groupWinningSide = resolveGroupWinningSide(groupValueGroups[groupNumber]);
    if (groupWinningSide) {
      sideTieValues[groupWinningSide - 1] += groupValueGroups[groupNumber].groupValue || 0;
    }
  }

  return sideTieValues;
}

function resolveGroupWinningSide(group) {
  const { allGroupMatchUpsCompleted, matchUpCount, winCriteria, sideWins, values } = group;

  if (winCriteria?.aggregateValue) {
    if (allGroupMatchUpsCompleted && values[0] !== values[1]) {
      return values[0] > values[1] ? 1 : 2;
    }
    return undefined;
  }

  if (winCriteria?.valueGoal) {
    return values.reduce((winningSide, side, i) => {
      return side >= winCriteria.valueGoal ? i + 1 : winningSide;
    }, undefined);
  }

  const winGoal = Math.floor(matchUpCount / 2) + 1;
  return sideWins.reduce((winningSide, side, i) => {
    return side >= winGoal ? i + 1 : winningSide;
  }, undefined);
}

function determineWinningSide({ drawDefinition, matchUpsMap, sideScores, tieFormat, matchUp }) {
  if (!tieFormat?.winCriteria) return undefined;

  const { valueGoal, aggregateValue, tallyDirectives } = tieFormat.winCriteria;
  const tieMatchUps = matchUp?.tieMatchUps ?? [];

  let winningSide;

  if (valueGoal) {
    winningSide = resolveValueGoalWinner(sideScores, valueGoal);
  } else if (aggregateValue) {
    winningSide = resolveAggregateWinner(tieMatchUps, sideScores);
  }

  if (!winningSide && tallyDirectives) {
    winningSide = resolveTallyWinner({
      drawDefinition,
      matchUpsMap,
      matchUp,
    });
  }

  return winningSide;
}

function resolveValueGoalWinner(sideScores, valueGoal) {
  const sideThatWon = sideScores
    .map((points, sideIndex) => ({
      sideNumber: sideIndex + 1,
      points,
    }))
    .find(({ points }) => points >= valueGoal);
  return sideThatWon?.sideNumber;
}

function resolveAggregateWinner(tieMatchUps, sideScores) {
  const allTieMatchUpsCompleted = tieMatchUps.every(
    (matchUp) =>
      (matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)) || matchUp.winningSide,
  );
  if (allTieMatchUpsCompleted && sideScores[0] !== sideScores[1]) {
    return sideScores[0] > sideScores[1] ? 1 : 2;
  }
  return undefined;
}

function resolveTallyWinner({ drawDefinition, matchUpsMap, matchUp }) {
  const matchUpId = matchUp.matchUpId;
  const inContextMatchUp = matchUp.hasContext
    ? matchUp
    : matchUpsMap?.drawMatchUps?.[matchUpId] ||
      (drawDefinition &&
        findDrawMatchUp({
          inContext: true,
          drawDefinition,
          matchUpId,
        })?.matchUp);

  if (!inContextMatchUp) return undefined;

  const { completedTieMatchUps, order } = tallyParticipantResults({
    matchUps: [inContextMatchUp],
  });

  if (!completedTieMatchUps || !order?.length) return undefined;

  const winningParticipantId = order[0].participantId;
  return inContextMatchUp.sides.find(({ participantId }) => participantId === winningParticipantId)?.sideNumber;
}
