import { parse } from '@Helpers/matchUpFormatCode/parse';
import { instanceCount } from '@Tools/arrays';
import { analyzeSet } from './analyzeSet';

// constants and types
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { Set as SetType } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

export function analyzeMatchUp(params?): ResultType & {
  completedSetsHaveValidOutcomes?: boolean;
  validMatchUpWinningSide?: boolean;
  calculatedWinningSide?: number;
  /** Both sides' points summed across the sets, for an AGGREGATE format only. */
  aggregateScores?: number[];
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
  // ── ...and it is decided only once EVERY set is played ──
  //
  // CA, 2026-10-05, on `SET9X-S:T10`: *"All nine must be played."* Reaching `setsToWin` early is a lead,
  // not a win: five bolts to side 1 resolved side 1 here while `validateScore` refused the same score
  // (`analyzeScore`'s `isExactlyComplete`), and `courthive-components` gates Submit on this, so the card
  // offered a result the engine then refused. The aggregate branch below already waits for every set.
  //
  const playsEverySet = exactly !== undefined;
  const everySetPlayed = !playsEverySet || (sets ?? []).filter(hasSetValues).length >= exactly;
  const reachedSetsToWin = playsEverySet ? everySetPlayed && maxSetsCount >= setsToWin : maxSetsCount === setsToWin;

  // ── An AGGREGATE format is decided on POINTS, and sets won are not the question ──
  //
  // CA, 2026-09-29: *"Sets to win is not a consideration when the format is INTENNSE ... INTENNSE
  // requires all sets recorded to be included in the aggregate total; there is not a bestOf construct
  // ... INTENNSE doesn't have games, so the aggregate is across all bolts."*
  //
  // Counting bolts would answer the wrong question confidently: measured on `SET2XA-S:T10`, a score
  // with six bolts to side 1 has side 2 ahead **132-78** on points. So an aggregate format takes its
  // own branch entirely, and the set counts above are not consulted for it.
  //
  // ── A tied aggregate is UNDECIDED, not a draw ──
  //
  // CA: *"if the aggregate across ALL played sets/bolts is a tied score, the decider must determine a
  // winner ... it must be understood to be implicit when competitionFormat is INTENNSE that a sudden
  // death point is the decider and that this needn't actually be in the matchUpFormat."*
  //
  // So `undefined` here means a decider is owed, not that the match ended level — and nothing about
  // that decider needs modelling. When the sudden-death point is recorded the totals stop being equal
  // and the winner falls out of the same sum. CA: *"The only case where `SET2XA-S:T10` never resolves
  // a winner is if both sides score the same exact number of points."*
  const aggregateScores = aggregate ? aggregateSideScores(sets, matchUpScoringFormat) : undefined;

  const calculatedWinningSide = aggregate
    ? aggregateWinningSide(aggregateScores)
    : (reachedSetsToWin && maxSetsInstances === 1 && setsWinCounts.indexOf(maxSetsCount) + 1) || undefined;

  const validMatchUpWinningSide =
    winningSideSetsCount > losingSideSetsCount && matchUpWinningSide === calculatedWinningSide;

  const validMatchUpOutcome = calculatedWinningSide && completedSetsHaveValidOutcomes && validMatchUpWinningSide;

  return {
    completedSetsHaveValidOutcomes,
    validMatchUpWinningSide,
    calculatedWinningSide,
    aggregateScores,
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

/** Whether a set carries any score at all, and is therefore one of the sets that were played. */
function hasSetValues(set: SetType): boolean {
  return [set?.side1Score, set?.side2Score, set?.side1TiebreakScore, set?.side2TiebreakScore].some(
    (value) => value !== undefined && value !== null,
  );
}

/**
 * Both sides' points, summed across every set that was played.
 *
 * `undefined` where the format expects more sets than have been recorded. CA, 2026-09-29: *"INTENNSE
 * requires all sets recorded to be included in the aggregate total"* — a running total taken before
 * the last bolt is in would name a leader, and a leader is not a winner.
 *
 * Which fields carry the points is asked of `analyzeSet` rather than assumed, because it differs by
 * set and it already applies the deciding-set rule. Measured: a timed bolt reports 22-21 in
 * `sideGameScores`, while a tiebreak decider reports its point in `sideTiebreakScores` and 0-0 games,
 * so reading the games alone would silently drop the one point that settles a tie.
 */
function aggregateSideScores(sets: SetType[] | undefined, matchUpScoringFormat: any): number[] | undefined {
  const played = (sets ?? []).filter(hasSetValues);
  const expected = matchUpScoringFormat?.exactly ?? matchUpScoringFormat?.bestOf;
  if (expected !== undefined && played.length < expected) return undefined;
  if (!played.length) return undefined;

  return played.reduce(
    (totals, setObject) => {
      const { setFormat, sideGameScores, sideTiebreakScores } = analyzeSet({ setObject, matchUpScoringFormat });
      const points = setFormat?.tiebreakSet ? sideTiebreakScores : sideGameScores;
      return [totals[0] + (points?.[0] ?? 0), totals[1] + (points?.[1] ?? 0)];
    },
    [0, 0],
  );
}

/** The side ahead on aggregate, or `undefined` while the totals are level and a decider is owed. */
function aggregateWinningSide(totals?: number[]): number | undefined {
  if (!totals || totals[0] === totals[1]) return undefined;
  return totals[0] > totals[1] ? 1 : 2;
}
