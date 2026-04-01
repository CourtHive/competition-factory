import { getSetWinningSide } from './getSetWinningSide';

// Constants
import {
  INVALID_GAME_SCORES,
  INVALID_VALUES,
  INVALID_WINNING_SIDE,
  MISSING_SET_OBJECT,
} from '@Constants/errorConditionConstants';

export function analyzeSet(params) {
  const { setObject, matchUpScoringFormat } = params;
  if (!setObject) return { error: MISSING_SET_OBJECT };

  const { setNumber } = setObject || {};
  const { bestOf, exactly } = matchUpScoringFormat || {};
  const maxSetNumber = bestOf || exactly;
  const isDecidingSet = !!(setNumber && maxSetNumber && setNumber === maxSetNumber);
  const setFormat = (isDecidingSet && matchUpScoringFormat?.finalSetFormat) || matchUpScoringFormat?.setFormat;
  const expectTiebreakSet = !!setFormat?.tiebreakSet;
  const expectTimedSet = !!setFormat?.timed;
  const expectStandardSet = !expectTiebreakSet && !expectTimedSet;

  const isValidSetNumber = !!(setNumber && maxSetNumber && setNumber <= maxSetNumber);

  const scores = extractScores(setObject);
  const { sideGameScores, sidePointScores, sideTiebreakScores } = scores;
  const sideGameScoresCount = sideGameScores.filter((sideScore) => sideScore !== undefined).length;
  const sidePointScoresCount = sidePointScores.filter((sideScore) => sideScore !== undefined).length;
  const sideTiebreakScoresCount = sideTiebreakScores.filter((tiebreakScore) => tiebreakScore !== undefined).length;

  const gameScoresCount = sideGameScores?.filter((s) => typeof s === 'number' && !Number.isNaN(s)).length;
  const tiebreakScoresCount = sideTiebreakScores?.filter((s) => typeof s === 'number' && !Number.isNaN(s)).length;

  const { tiebreakAt } = setFormat || {};
  const hasTiebreakCondition = tiebreakAt && sideGameScores.filter((gameScore) => gameScore >= tiebreakAt).length === 2;

  const leadingSide = determineLeadingSide(hasTiebreakCondition, sideGameScores);

  const isTiebreakSet = !!(tiebreakScoresCount && !gameScoresCount);

  const isCompletedSet = !!setObject?.winningSide;
  const { error: standardSetError, result: isValidStandardSetOutcome } = checkValidStandardSetOutcome({
    sideTiebreakScores,
    sideGameScores,
    setFormat,
    setObject,
  });

  const { error: tiebreakSetError, result: isValidTiebreakSetOutcome } = checkValidTiebreakSetOutcome({
    sideTiebreakScores,
    setObject,
    setFormat,
  });

  const isValidSetOutcome = deriveValidSetOutcome({
    isValidStandardSetOutcome,
    isValidTiebreakSetOutcome,
    expectStandardSet,
    expectTiebreakSet,
    expectTimedSet,
    isTiebreakSet,
  });

  const isValidSet =
    isValidSetNumber &&
    !(expectTiebreakSet && !isTiebreakSet) &&
    !(expectStandardSet && isTiebreakSet) &&
    (!isCompletedSet || isValidSetOutcome);

  const winningSide = getSetWinningSide({
    isTimedSet: expectTimedSet,
    matchUpScoringFormat,
    isDecidingSet,
    isTiebreakSet,
    setObject,
  });

  const analysis: { [key: string]: any } = {
    expectTiebreakSet,
    expectTimedSet,
    hasTiebreakCondition,
    isCompletedSet,
    isDecidingSet,
    isTiebreakSet,
    isValidSet,
    isValidSetNumber,
    isValidSetOutcome,
    leadingSide,
    setFormat,
    sideGameScores,
    sideGameScoresCount,
    sidePointScores,
    sidePointScoresCount,
    sideTiebreakScores,
    sideTiebreakScoresCount,
    winningSide,
  };

  if (setObject?.winningSide !== undefined) {
    appendOutcomeValidation({
      isValidStandardSetOutcome,
      isValidTiebreakSetOutcome,
      standardSetError,
      tiebreakSetError,
      isTiebreakSet,
      analysis,
    });
  }

  return analysis;
}

function extractScores(setObject) {
  return {
    sideGameScores: [setObject?.side1Score, setObject?.side2Score],
    sidePointScores: [setObject?.side1PointScore, setObject?.side2PointScore],
    sideTiebreakScores: [setObject?.side1TiebreakScore, setObject?.side2TiebreakScore],
  };
}

function determineLeadingSide(hasTiebreakCondition, sideGameScores) {
  if (!hasTiebreakCondition) return undefined;
  if (sideGameScores[0] > sideGameScores[1]) return 1;
  if (sideGameScores[1] > sideGameScores[0]) return 2;
  return undefined;
}

function deriveValidSetOutcome({
  isValidStandardSetOutcome,
  isValidTiebreakSetOutcome,
  expectStandardSet,
  expectTiebreakSet,
  expectTimedSet,
  isTiebreakSet,
}) {
  return (
    (expectStandardSet && !isTiebreakSet && isValidStandardSetOutcome) ||
    (expectTiebreakSet && isTiebreakSet && isValidTiebreakSetOutcome) ||
    expectTimedSet
  );
}

function appendOutcomeValidation({
  isValidStandardSetOutcome,
  isValidTiebreakSetOutcome,
  standardSetError,
  tiebreakSetError,
  isTiebreakSet,
  analysis,
}) {
  if (isTiebreakSet) {
    analysis.isValidTiebreakSetOutcome = isValidTiebreakSetOutcome;
    if (!isValidTiebreakSetOutcome) {
      analysis.tiebreakSetError = tiebreakSetError;
    }
  } else {
    analysis.isValidStandardSetOutcome = isValidStandardSetOutcome;
    if (!isValidStandardSetOutcome) {
      analysis.standardSetError = standardSetError;
    }
  }
}

function checkValidStandardSetOutcome({ setObject, setFormat, sideGameScores, sideTiebreakScores }) {
  if (!setObject) {
    return { result: false, error: MISSING_SET_OBJECT };
  }
  const expectTiebreakSet = !!setFormat?.tiebreakSet;
  const expectTimedSet = !!setFormat?.timed;
  if (!setFormat || expectTiebreakSet || expectTimedSet) {
    return { result: false, error: INVALID_VALUES };
  }

  const validGameScores = sideGameScores?.filter((s) => typeof s === 'number' && !Number.isNaN(s)).length === 2;
  if (!validGameScores) return { result: false, error: INVALID_GAME_SCORES };

  const { setTo, tiebreakAt, tiebreakFormat, NoAD } = setFormat || {};
  const meetsSetTo = !!(setTo && sideGameScores?.find((gameScore) => gameScore >= setTo));
  if (!meetsSetTo) return { result: false, error: INVALID_GAME_SCORES };

  const validWinningSides = new Set([1, 2]);
  const isValidWinningSide = validWinningSides.has(setObject?.winningSide);
  if (!setObject || !isValidWinningSide) return { result: false, error: INVALID_WINNING_SIDE };

  const winningSideIndex = setObject?.winningSide - 1;
  const losingSideIndex = 1 - winningSideIndex;
  const winningSideGameScore = sideGameScores[winningSideIndex];
  const losingSideGameScore = sideGameScores[losingSideIndex];
  const gamesDifference = winningSideGameScore - losingSideGameScore;
  const winningSideIsHighGameValue = winningSideGameScore > losingSideGameScore;
  if (!winningSideIsHighGameValue) {
    return {
      result: false,
      error: { message: 'winningSide game scoreString is not high' },
    };
  }

  const tiebreakError = validateTiebreakCondition({
    winningSideGameScore,
    sideTiebreakScores,
    winningSideIndex,
    losingSideIndex,
    sideGameScores,
    gamesDifference,
    tiebreakFormat,
    tiebreakAt,
    setTo,
  });
  if (tiebreakError) return tiebreakError;

  const hasTiebreakCondition = tiebreakAt && sideGameScores.filter((gameScore) => gameScore >= tiebreakAt).length === 2;

  const minimumGamesWinMargin = NoAD ? 1 : 2;
  const losingSideGameScoreAtSetToThreshold = losingSideGameScore >= setTo - 1;
  const invalidWinningScore =
    gamesDifference &&
    losingSideGameScoreAtSetToThreshold &&
    !hasTiebreakCondition &&
    gamesDifference < minimumGamesWinMargin;

  if (invalidWinningScore) {
    return {
      result: false,
      error: { message: 'invalid winning game scoreString (3)' },
    };
  }

  if (gamesDifference > minimumGamesWinMargin && winningSideGameScore > setTo) {
    return {
      result: false,
      error: { message: 'invalid winning game scoreString (4)' },
    };
  }

  return { result: true };
}

function validateTiebreakCondition({
  winningSideGameScore,
  sideTiebreakScores,
  winningSideIndex,
  losingSideIndex,
  sideGameScores,
  gamesDifference,
  tiebreakFormat,
  tiebreakAt,
  setTo,
}) {
  const setTiebreakDefined = tiebreakAt && tiebreakFormat;
  if (!setTiebreakDefined) return undefined;

  const validTiebreakScores = sideTiebreakScores?.filter((s) => typeof s === 'number' && !Number.isNaN(s)).length === 2;
  const winningSideTiebreakScore = sideTiebreakScores?.[winningSideIndex];
  const losingSideTiebreakScore = sideTiebreakScores?.[losingSideIndex];
  const hasTiebreakCondition = tiebreakAt && sideGameScores.filter((gameScore) => gameScore >= tiebreakAt).length === 2;

  const { NoAD: tiebreakNoAD, tiebreakTo } = tiebreakFormat;

  if (hasTiebreakCondition) {
    if (gamesDifference > 1) {
      return {
        result: false,
        error: { message: 'invalid winning game scoreString (5)' },
      };
    }
    if (!validTiebreakScores) {
      return {
        result: false,
        error: { message: 'invalid tiebreak scores (1)' },
      };
    }

    if (typeof tiebreakTo !== 'number' || Number.isNaN(tiebreakTo)) {
      return { result: false, error: { message: 'tiebreakTo error' } };
    }

    const meetsTiebreakTo = !!(
      tiebreakTo && sideTiebreakScores?.find((tiebreakScore) => tiebreakScore >= tiebreakTo)
    );
    if (!meetsTiebreakTo) {
      return {
        result: false,
        error: { message: 'invalid tiebreak scores (2)' },
      };
    }

    const maxGameScore = tiebreakAt < setTo ? setTo : setTo + 1;
    if (winningSideGameScore > maxGameScore) {
      return {
        result: false,
        error: { message: 'invalid winning game scoreString (1)' },
      };
    }

    if (!winningSideTiebreakScore || !losingSideTiebreakScore || winningSideTiebreakScore < losingSideTiebreakScore) {
      return {
        result: false,
        error: { message: 'winningSide tiebreak value is not high' },
      };
    }

    const minimumTiebreakWinMargin = tiebreakNoAD ? 1 : 2;
    const tiebreakDifference = winningSideTiebreakScore - losingSideTiebreakScore;
    const losingSideGameScoreAtTiebreakToThreshold = losingSideTiebreakScore >= tiebreakTo - 1;
    const invalidTiebreakScore =
      tiebreakDifference && losingSideGameScoreAtTiebreakToThreshold && tiebreakDifference < minimumTiebreakWinMargin;

    if (invalidTiebreakScore) {
      return {
        result: false,
        error: { message: 'invalid tiebreak scores (3)' },
      };
    }
  }

  const hasTiebreakGameScore = winningSideGameScore > setTo;
  if (hasTiebreakGameScore && !hasTiebreakCondition) {
    return {
      result: false,
      error: { message: 'invalid winning game scoreString (2)' },
    };
  }

  return undefined;
}

function checkValidTiebreakSetOutcome({ setObject, setFormat, sideTiebreakScores }) {
  if (!setObject) {
    return { result: false, error: MISSING_SET_OBJECT };
  }
  const expectTiebreakSet = !!setFormat?.tiebreakSet;
  const expectTimedSet = !!setFormat?.timed;
  if (!setFormat || !expectTiebreakSet || expectTimedSet) {
    return { result: false, error: { message: 'not tiebreak set' } };
  }

  const validWinningSides = new Set([1, 2]);
  const isValidWinningSide = validWinningSides.has(setObject?.winningSide);
  if (!setObject || !isValidWinningSide) return { result: false, error: INVALID_WINNING_SIDE };

  const { tiebreakSet } = setFormat || {};
  const { NoAD, tiebreakTo } = tiebreakSet || {};

  const validTiebreakScores = sideTiebreakScores?.filter((s) => typeof s === 'number' && !Number.isNaN(s)).length === 2;
  if (!validTiebreakScores) {
    return { result: false, error: { message: 'invalid tiebreak scores (1)' } };
  }

  if (Number.isNaN(tiebreakTo)) {
    return { result: false, error: { message: 'tiebreakTo error' } };
  }

  const meetsTiebreakTo = !!sideTiebreakScores?.find((tiebreakScore) => tiebreakScore >= tiebreakTo);
  if (!meetsTiebreakTo) {
    return { result: false, error: { message: 'invalid tiebreak scores (2)' } };
  }

  const winningSideIndex = setObject?.winningSide - 1;
  const losingSideIndex = 1 - winningSideIndex;
  const winningSideTiebreakScore = sideTiebreakScores[winningSideIndex];
  const losingSideTiebreakScore = sideTiebreakScores[losingSideIndex];

  if (!winningSideTiebreakScore || !losingSideTiebreakScore || winningSideTiebreakScore < losingSideTiebreakScore) {
    return {
      result: false,
      error: { message: 'winningSide tiebreak value is not high' },
    };
  }

  const minimumTiebreakWinMargin = NoAD ? 1 : 2;
  const tiebreakDifference = winningSideTiebreakScore - losingSideTiebreakScore;
  const losingSideGameScoreAtTiebreakToThreshold = losingSideTiebreakScore >= tiebreakTo - 1;
  const invalidTiebreakScore =
    tiebreakDifference && losingSideGameScoreAtTiebreakToThreshold && tiebreakDifference < minimumTiebreakWinMargin;

  if (invalidTiebreakScore) {
    return { result: false, error: { message: 'invalid tiebreak scores (3)' } };
  }

  return { result: true };
}
