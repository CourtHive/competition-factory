import { isTiebreakGamesScore, isTiebreakWon, tiebreakSetGames, wonWithoutTiebreak } from './tiebreakAtRules';
import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { isTiebreakMarker, readTiebreakSet } from './tiebreakSetShape';
import { getSetWinningSide } from './getSetWinningSide';

// constants
import {
  INVALID_GAME_SCORES,
  INVALID_VALUES,
  INVALID_WINNING_SIDE,
  MISSING_SET_OBJECT,
} from '@Constants/errorConditionConstants';

export function analyzeSet(params) {
  const { setObject, matchUpScoringFormat } = params;
  if (!setObject) return { error: MISSING_SET_OBJECT };

  const { setNumber } = setObject ?? {};
  const { bestOf, exactly } = matchUpScoringFormat ?? {};
  const maxSetNumber = bestOf || exactly;
  const isDecidingSet = finalSetGoverns(
    matchUpScoringFormat,
    setNumber,
    !!(setNumber && maxSetNumber && setNumber === maxSetNumber),
  );
  const setFormat = (isDecidingSet && matchUpScoringFormat?.finalSetFormat) || matchUpScoringFormat?.setFormat;
  const expectTiebreakSet = !!setFormat?.tiebreakSet;
  const expectTimedSet = !!setFormat?.timed;
  const expectStandardSet = !expectTiebreakSet && !expectTimedSet;

  const isValidSetNumber = !!(setNumber && maxSetNumber && setNumber <= maxSetNumber);

  // One reading of where the points are, whatever shape the set arrived in — see `tiebreakSetShape`
  const scores = extractScores(setObject, setFormat);
  const { sideGameScores, sidePointScores, sideTiebreakScores, isTiebreakSet } = scores;
  const sideGameScoresCount = sideGameScores.filter((sideScore) => sideScore !== undefined).length;
  const sidePointScoresCount = sidePointScores.filter((sideScore) => sideScore !== undefined).length;
  const sideTiebreakScoresCount = sideTiebreakScores.filter((tiebreakScore) => tiebreakScore !== undefined).length;

  const { tiebreakAt } = setFormat ?? {};
  const hasTiebreakCondition =
    tiebreakAt &&
    sideGameScores.filter((gameScore) => typeof gameScore === 'number' && gameScore >= tiebreakAt).length === 2;

  const leadingSide = determineLeadingSide(hasTiebreakCondition, sideGameScores);

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

// A tiebreak-only set was "tiebreak scores and no game scores" here, which is ONE of the three shapes it
// arrives in: the point engine and every hydrated read carry the 1-0 marker beside the points, and a
// format-aware parse put the points in the game fields. Both were invalid sets to this analysis, and
// `setMatchUpState`'s revert guard, which asks `analyzeMatchUp`, failed open on them (G3, 2026-10-02).
function extractScores(setObject, setFormat) {
  const { isTiebreakSet, sideGameScores, sideTiebreakScores } = readTiebreakSet(setObject, setFormat);
  return {
    sidePointScores: [setObject?.side1PointScore, setObject?.side2PointScore],
    sideTiebreakScores,
    sideGameScores,
    isTiebreakSet,
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

  const { setTo, tiebreakAt, tiebreakFormat, winBy } = setFormat ?? {};
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

  // Two games, or the margin the format DECLARES (`WB1`). `NoAD` is a games property and read this as a
  // one-game set margin until 2026-10-01 — see `checkSetIsComplete` for the ruling.
  const minimumGamesWinMargin = winBy ?? 2;
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
    // A 7-6 with NO tiebreak points recorded is a finished set (CA, 2026-10-02, ruling V11: "so prevalent"
    // — 4.6% of ITA's completed tiebreak sets). One side's points without the other's is still refused.
    const noTiebreakPoints = sideTiebreakScores?.every((s) => s === undefined || s === null);
    if (
      noTiebreakPoints &&
      isTiebreakGamesScore(winningSideGameScore, sideGameScores[losingSideIndex], { setTo, tiebreakAt })
    ) {
      return undefined;
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

    const meetsTiebreakTo = !!(tiebreakTo && sideTiebreakScores?.find((tiebreakScore) => tiebreakScore >= tiebreakTo));
    if (!meetsTiebreakTo) {
      return {
        result: false,
        error: { message: 'invalid tiebreak scores (2)' },
      };
    }

    // the tiebreak winner's games: 7 for `@6`, 6 for `@5`, 13 for `@12` — see `tiebreakAtRules`
    const maxGameScore = tiebreakSetGames({ setTo, tiebreakAt })?.winner ?? setTo + 1;
    if (winningSideGameScore > maxGameScore) {
      return {
        result: false,
        error: { message: 'invalid winning game scoreString (1)' },
      };
    }

    // `typeof`, not truthiness: a losing tiebreak score of 0 is a score, and `!0` read it as MISSING, so every
    // 7-6(0) was an invalid set here while the validators, the engine and key-value entry all accept
    // it — and `setMatchUpState`'s revert guard, which asks `validMatchUpOutcome`, failed open on it
    // (validator debate V1, 2026-10-02).
    if (
      typeof winningSideTiebreakScore !== 'number' ||
      typeof losingSideTiebreakScore !== 'number' ||
      winningSideTiebreakScore < losingSideTiebreakScore
    ) {
      return {
        result: false,
        error: { message: 'winningSide tiebreak value is not high' },
      };
    }

    // Won by the margin, and never past the target by more than it — see `isTiebreakWon` (V7)
    if (!isTiebreakWon(winningSideTiebreakScore, losingSideTiebreakScore, { tiebreakTo, NoAD: tiebreakNoAD })) {
      return {
        result: false,
        error: { message: 'invalid tiebreak scores (3)' },
      };
    }
  }

  // A winner past `setTo` without six-all is a tiebreak-set shape with no tiebreak — EXCEPT the one score
  // that reaches `setTo + 1` outright: 7-5, from five-all, where the tiebreak at six-all is never reached.
  // This refused it as "(2)" (measured 2026-10-02, with or without `NOAD`), while `getSetWinningSide`
  // named the winner — one set, two answers. Only where the tiebreak sits AT `setTo`: under `@5` a 7-5
  // is impossible, because five-all is already the tiebreak.
  // Without the tiebreak condition the games must be a set won by the margin with the loser still
  // below the tiebreak games: 7-5 under `@6`, 12-10 and 13-11 under `@12`, never 7-3 or 8-3.
  const losingSideGameScore = sideGameScores[losingSideIndex];
  const hasTiebreakGameScore = winningSideGameScore > setTo;
  const wonByTheMargin = wonWithoutTiebreak(winningSideGameScore, losingSideGameScore, { setTo, tiebreakAt });
  if (hasTiebreakGameScore && !hasTiebreakCondition && !wonByTheMargin) {
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

  const { tiebreakSet } = setFormat ?? {};
  const { NoAD, tiebreakTo } = tiebreakSet ?? {};

  // The 1-0 marker alone: a finished tiebreak set whose points were not kept (CA, V11)
  if (isTiebreakMarker(setObject, setFormat)) {
    const markerWinner = setObject.side1Score === 1 ? 1 : 2;
    return setObject.winningSide === markerWinner
      ? { result: true }
      : { result: false, error: { message: 'tiebreak set marker contradicts the set winner' } };
  }

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

  // `typeof`, not truthiness — a [10-0] is a tiebreak set: the loser's 0 is a score
  // (see the same read in validateTiebreakCondition)
  if (
    typeof winningSideTiebreakScore !== 'number' ||
    typeof losingSideTiebreakScore !== 'number' ||
    winningSideTiebreakScore < losingSideTiebreakScore
  ) {
    return {
      result: false,
      error: { message: 'winningSide tiebreak value is not high' },
    };
  }

  // Won by the margin, and never past the target by more than it — see `isTiebreakWon` (V7). The margin
  // is capped at the target, so a `TB1` decider's `1-0` is a won set here too.
  if (!isTiebreakWon(winningSideTiebreakScore, losingSideTiebreakScore, { tiebreakTo, NoAD })) {
    return { result: false, error: { message: 'invalid tiebreak scores (3)' } };
  }

  return { result: true };
}
