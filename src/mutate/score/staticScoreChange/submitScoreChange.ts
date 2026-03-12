import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { analyzeSet } from '@Query/matchUp/analyzeSet';

import {
  MISSING_MATCHUP,
  MISSING_SET_NUMBER,
  MISSING_SIDE_NUMBER,
  INVALID_SIDE_NUMBER,
  MISSING_VALUE,
  INVALID_SET_NUMBER,
} from '@Constants/errorConditionConstants';

/**
 * Work in progress: utility for scoring dialogs to submit score change
 */
export function submitScoreChange(params?) {
  const { matchUp, sideNumber, setNumber, value } = params || {};

  if (!matchUp) {
    return { result: false, error: MISSING_MATCHUP };
  }
  if (!sideNumber) {
    return { result: false, error: MISSING_SIDE_NUMBER };
  }
  if (!setNumber) {
    return { result: false, error: MISSING_SET_NUMBER };
  }
  if (!value) {
    return { result: false, error: MISSING_VALUE };
  }

  const analysis = analyzeMatchUp(params);

  if (!analysis.isValidSideNumber) return { result: false, error: INVALID_SIDE_NUMBER };

  const { modifiedSet, isValidSet, winnerChanged } = getModifiedSet(params);
  if (!isValidSet) return { result: false, error: INVALID_SET_NUMBER };

  if (winnerChanged) {
    if (analysis.isLastSetWithValues) {
      console.log('valid set modification', { modifiedSet });
    } else {
      console.log('is NOT last set with values');
      console.log('winner changed: all subsequent sets must be removed');
    }
  }

  return { result: true, modifiedSet };
}

function getModifiedSet(params) {
  const { matchUp, sideNumber, setNumber, isTiebreakValue, isGameValue, value } = params || {};
  let { matchUpFormat } = params || {};
  const analysis = analyzeMatchUp(params);

  const setObject = matchUp?.score?.sets.find((set) => set.setNumber === setNumber);
  const modifiedSet = setObject ?? { setNumber };

  if (isTiebreakValue) {
    if (!analysis.expectTimedSet) {
      if (sideNumber === 1) {
        modifiedSet.side1TiebreakScore = value;
      } else if (sideNumber === 2) {
        modifiedSet.side2TiebreakScore = value;
      }
    }
  } else if (isGameValue) {
    if (sideNumber === 1) {
      modifiedSet.side1PointScore = value;
    } else if (sideNumber === 2) {
      modifiedSet.side2PointScore = value;
    }
  } else if (sideNumber === 1) {
    modifiedSet.side1Score = value;
  } else if (sideNumber === 2) {
    modifiedSet.side2Score = value;
  }

  matchUpFormat = matchUpFormat || matchUp?.matchUpFormat;
  const matchUpScoringFormat = parse(matchUpFormat);
  let modifiedSetAnalysis = analyzeSet({
    setObject: modifiedSet,
    matchUpScoringFormat,
  });

  modifiedSet.winningSide = modifiedSetAnalysis.winningSide;

  const { isValidSet } = modifiedSetAnalysis;
  if (!isValidSet) {
    // check modifications which might make it a valid set
    const { hasTiebreakCondition, sideTiebreakScoresCount } = modifiedSetAnalysis;

    if (hasTiebreakCondition && sideTiebreakScoresCount) {
      modifiedSet.side1TiebreakScore = undefined;
      modifiedSet.side2TiebreakScore = undefined;
      modifiedSet.winningSide = false;

      const attemptedModificationAnalysis = analyzeSet({
        setObject: modifiedSet,
        matchUpScoringFormat,
      });

      if (attemptedModificationAnalysis.isValidSet) {
        modifiedSet.winningSide = attemptedModificationAnalysis.winningSide;
        const winnerChanged = setObject?.winningSide !== modifiedSet.winningSide;
        modifiedSetAnalysis = attemptedModificationAnalysis;
        return {
          modifiedSet,
          isValidSet: true,
          winnerChanged,
          modifiedSetAnalysis,
        };
      }
    }
  }

  const winnerChanged = setObject?.winningSide !== modifiedSet.winningSide;

  return { modifiedSet, isValidSet, winnerChanged, modifiedSetAnalysis };
}
