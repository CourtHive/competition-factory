import { parse } from '@Helpers/matchUpFormatCode/parse';
import { instanceCount } from '@Tools/arrays';
import { analyzeSet } from './analyzeSet';

// constants and types
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

export function analyzeMatchUp(params?): ResultType & {
  completedSetsHaveValidOutcomes?: boolean;
  validMatchUpWinningSide?: boolean;
  calculatedWinningSide?: number;
  isLastSetWithValues?: boolean;
  validMatchUpOutcome?: boolean;
  sideTiebreakScores?: number[];
  isCompletedMatchUp?: boolean;
  completedSetsCount?: number;
  isValidSideNumber?: boolean;
  matchUpScoringFormat?: any;
  hasExistingValue?: boolean;
  sidePointScores?: number[];
  sideGameScores?: number[];
  expectTimedSet?: boolean;
  isCompletedSet?: boolean;
  isExistingSet?: boolean;
  existingValue?: number;
  isActiveSet?: boolean;
  winningSide?: number;
} {
  const { matchUp, sideNumber, setNumber, isTiebreakValue, isPointValue } = params ?? {};
  let { matchUpFormat } = params ?? {};
  if (!matchUp) return { error: MISSING_MATCHUP };

  matchUpFormat = matchUpFormat || matchUp?.matchUpFormat;
  const matchUpScoringFormat = parse(matchUpFormat);
  const isCompletedMatchUp = !!matchUp?.winningSide;

  const sets = matchUp.score?.sets;
  const setsCount = sets?.length;
  const setIndex = setNumber && setNumber - 1;
  const isExistingSet = !!sets?.find((set, index) => set.setNumber === setNumber && index === setIndex);
  const completedSets = sets?.filter((set) => set?.winningSide) ?? [];
  const completedSetsCount = completedSets?.length || 0;
  const setsFollowingCurrent = (setNumber && sets?.slice(setNumber)) ?? [];
  const isLastSetWithValues = !!(
    setsCount &&
    setNumber &&
    // EVERY: is this a candidate for .every?
    setsFollowingCurrent?.reduce((noValues, set) => {
      return (
        (!set ||
          (!set.side1Score &&
            !set.side2Score &&
            !set.side1TiebreakScore &&
            !set.side2TiebreakScore &&
            !set.side1PointScore &&
            !set.side2PointScore)) &&
        noValues
      );
    }, true)
  );

  const setObject = setNumber <= setsCount && sets.find((set) => set.setNumber === setNumber);
  const specifiedSetAnalysis = setObject && analyzeSet({ setObject, matchUpScoringFormat });

  const {
    isCompletedSet,
    sideGameScores,
    // sidePointScores,
    sideTiebreakScores,
  } = specifiedSetAnalysis ?? {};
  const isActiveSet = !!(
    (setObject && !isCompletedSet && isLastSetWithValues) ||
    (setNumber && setNumber === setsCount + 1 && !isCompletedMatchUp)
  );

  const isValidSideNumber = [1, 2].includes(sideNumber);
  const sideIndex = isValidSideNumber ? sideNumber - 1 : 0;

  const existingValue =
    setObject &&
    isValidSideNumber &&
    ((!isTiebreakValue && !isPointValue && sideGameScores[sideIndex] !== undefined && sideGameScores[sideIndex]) ||
      (isTiebreakValue && sideTiebreakScores[sideIndex] !== undefined && sideTiebreakScores[sideIndex]));
  const hasExistingValue = !!existingValue;

  const completedSetsHaveValidOutcomes = completedSets
    ?.map((setObject) => analyzeSet({ setObject, matchUpScoringFormat }).isValidSetOutcome)
    .reduce((valid, validOutcome) => valid && validOutcome, true);

  const setsWinCounts = completedSets.reduce(
    (counts, set) => {
      const { winningSide } = set;
      const winningSideIndex = winningSide - 1;
      counts[winningSideIndex]++;
      return counts;
    },
    [0, 0],
  );
  const matchUpWinningSide = matchUp?.winningSide;
  const matchUpWinningSideIndex = matchUpWinningSide && matchUpWinningSide - 1;
  const matchUpLosingSideIndex = 1 - matchUpWinningSideIndex;
  const winningSideSetsCount = setsWinCounts[matchUpWinningSideIndex];
  const losingSideSetsCount = setsWinCounts[matchUpLosingSideIndex];

  const maxSetsCount = Math.max(...setsWinCounts);
  const maxSetsInstances = instanceCount(setsWinCounts)[maxSetsCount];
  const { bestOf, exactly, aggregate } = matchUpScoringFormat ?? {};
  const setsToWin = Math.ceil((bestOf || exactly || 1) / 2);

  // ── A format that plays EVERY set can pass `setsToWin`, and one that stops cannot ──
  //
  // A best-of ends the moment a side reaches `setsToWin`, so a count above it can only come from a
  // malformed score and equality is the exact test.
  //
  // An `exactly` format plays all N sets whatever the running score, so the winner routinely exceeds
  // it — and under equality the match then reported NO WINNER. Measured against `SET9X-S:T10`
  // (`setsToWin` 5) on full nine-bolt scores: 5-4 resolved side 1, while **6-3, 7-2 and 9-0 all
  // resolved `undefined`**. A side that took two thirds of the bolts had not won; a side that took
  // every one of them had not won either. Downstream that is not cosmetic — `courthive-components`
  // gates its Submit on this, so a decided bolt match could not be recorded unless it ended 5-4.
  //
  // ── AGGREGATE formats are deliberately left alone, and left with NO opinion ──
  //
  // CA, 2026-09-29: *"Sets to win is not a consideration when the format is INTENNSE."* In an
  // aggregate format (`SET9XA`, `HAL2A`) the match is decided by total points across the bolts, not by
  // how many bolts each side took — so counting sets is the wrong question, and `>=` here would answer
  // it confidently and wrongly. Measured: six bolts to one side while the other leads 132-78 on
  // points. Nothing in this file sums points, so aggregate keeps returning `undefined` exactly as
  // before: no opinion, which is honest, rather than the bolt-count winner, which is not.
  const playsEverySet = exactly !== undefined && !aggregate;
  const reachedSetsToWin = playsEverySet ? maxSetsCount >= setsToWin : maxSetsCount === setsToWin;

  const calculatedWinningSide =
    (reachedSetsToWin && maxSetsInstances === 1 && setsWinCounts.indexOf(maxSetsCount) + 1) || undefined;

  const validMatchUpWinningSide =
    winningSideSetsCount > losingSideSetsCount && matchUpWinningSide === calculatedWinningSide;

  const validMatchUpOutcome = calculatedWinningSide && completedSetsHaveValidOutcomes && validMatchUpWinningSide;

  return {
    completedSetsHaveValidOutcomes,
    validMatchUpWinningSide,
    calculatedWinningSide,
    matchUpScoringFormat,
    validMatchUpOutcome,
    isLastSetWithValues,
    completedSetsCount,
    isCompletedMatchUp,
    isValidSideNumber,
    hasExistingValue,
    existingValue,
    isExistingSet,
    isActiveSet,
    ...specifiedSetAnalysis,
  };
}
