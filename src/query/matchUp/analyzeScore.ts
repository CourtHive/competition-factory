import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { timedSetWinnerContradicts } from '@Validators/timedSetWinner';
import { parse, ParsedFormat } from '@Helpers/matchUpFormatCode/parse';
import { tiebreakSetCeiling } from '@Query/matchUp/tiebreakAtRules';
import { isMatchUpStatus } from '@Validators/isMatchUpStatus';
import { maxExactlySets } from '@Validators/setCount';
import { instanceCount } from '@Tools/arrays';

// constants and types
import { COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { Score, Set as SetType } from '@Types/tournamentTypes';

type AnalyzeScoreArgs = {
  existingMatchUpStatus?: string;
  matchUpStatus?: string;
  matchUpFormat?: string;
  winningSide?: number;
  score: Score;
};

function validateTiebreak(
  tiebreakFormat: any,
  side1TiebreakScore: number | undefined,
  side2TiebreakScore: number | undefined,
  setWinningSide: number | undefined,
  isLastSet: boolean,
  irregularEnding: boolean,
): boolean {
  const { tiebreakTo, NoAD } = tiebreakFormat ?? {};
  const maxTiebreakScore = Math.max(side1TiebreakScore ?? 0, side2TiebreakScore ?? 0);

  if (NoAD && maxTiebreakScore > tiebreakTo) return false;
  if (maxTiebreakScore < tiebreakTo && setWinningSide) {
    if (isLastSet && !irregularEnding) return false;
    if (!isLastSet) return false;
  }

  return true;
}

function validateSet(
  set: SetType,
  i: number,
  matchUpScoringFormat: ParsedFormat,
  totalSets: number,
  isLastSet: boolean,
  irregularEnding: boolean,
): boolean {
  const setNumber = i + 1;
  const isFinalSet = finalSetGoverns(matchUpScoringFormat, setNumber, setNumber === totalSets);

  const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore, winningSide: setWinningSide } = set;
  const maxSetScore = Math.max(side1Score ?? 0, side2Score ?? 0);
  const hasTiebreak = side1TiebreakScore ?? side2TiebreakScore;

  const { finalSetFormat, setFormat } = matchUpScoringFormat;
  const setValues = isFinalSet ? finalSetFormat || setFormat : setFormat;

  // An advantage set has no tiebreak to record and is won by two clear games (or its declared `winBy`).
  // This accepted tiebreak points and a one-game margin in `SET1-S:6` — measured 2026-10-02, the
  // mutation path recorded `7-6(5)` there — because the only tiebreak check ran with an undefined
  // tiebreak format and passed. `parse` writes `noTiebreak`; the same reading as `validateSetScore`.
  const formatHasTiebreak =
    !setValues?.noTiebreak && !!(setValues?.tiebreakFormat || typeof setValues?.tiebreakAt === 'number');
  if (!formatHasTiebreak && setValues?.setTo && !setValues.timed) {
    if (hasTiebreak !== undefined && hasTiebreak !== null) return false;
    const margin = Math.abs((side1Score ?? 0) - (side2Score ?? 0));
    if (setWinningSide && margin < (setValues.winBy ?? 2)) return false;
  }

  if (hasTiebreak) {
    const isValidTiebreak = validateTiebreak(
      setValues?.tiebreakFormat,
      side1TiebreakScore,
      side2TiebreakScore,
      setWinningSide,
      isLastSet,
      irregularEnding,
    );
    if (!isValidTiebreak) return false;
  }

  if (setValues?.timed && timedSetWinnerContradicts(set)) return false;
  if (!setValues.setTo) return true;

  // The ceiling is the tiebreak winner's games wherever the format puts its tiebreak: 6 for `@5`, 7 for
  // `@6`, 13 for `@12`. `setTo + 1` accepted a 7-5 under `@5` (five-all is the tiebreak) and refused a
  // 12-10 under `@12` (validator debate V8 and G1, 2026-10-02).
  const ceiling = tiebreakSetCeiling(setValues) ?? setValues.setTo + 1;
  const excessiveSetScore = !setValues.noTiebreak && maxSetScore > ceiling;
  return !excessiveSetScore;
}

function calculateAggregateWinner(sets: SetType[]): number | undefined {
  const aggregateTotals = sets.reduce(
    (totals, set) => {
      if (set.side1Score !== undefined || set.side2Score !== undefined) {
        totals[0] += set.side1Score ?? 0;
        totals[1] += set.side2Score ?? 0;
      }
      return totals;
    },
    [0, 0],
  );

  if (aggregateTotals[0] > aggregateTotals[1]) {
    return 1;
  } else if (aggregateTotals[1] > aggregateTotals[0]) {
    return 2;
  } else {
    const tiebreakSet = sets.find(
      (set) => set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined,
    );
    return tiebreakSet?.winningSide;
  }
}

function calculateStandardWinner(
  maxSetsCount: number,
  setsToWin: number,
  maxSetsInstances: number,
  setsWinCounts: number[],
  matchUpFormat?: string,
  playsEverySet?: boolean,
): number | undefined {
  // A best-of stops the moment a side reaches `setsToWin`, so equality is the exact test. An `exactly`
  // format plays every set whatever the running score, so its winner routinely passes `setsToWin` — and
  // under equality a 3-0 sweep of `SET3X-S:T10` had NO winner and the engine refused it, while
  // `analyzeMatchUp` named side 1 (validator debate V9, re-measured 2026-10-02).
  const reachedSetsToWin = playsEverySet ? maxSetsCount >= setsToWin : maxSetsCount === setsToWin;
  return (
    ((!matchUpFormat || reachedSetsToWin) && maxSetsInstances === 1 && setsWinCounts.indexOf(maxSetsCount) + 1) ||
    undefined
  );
}

export function analyzeScore({
  existingMatchUpStatus,
  matchUpFormat,
  matchUpStatus,
  winningSide,
  score,
}: AnalyzeScoreArgs) {
  if (matchUpStatus !== undefined && !isMatchUpStatus(matchUpStatus)) return { valid: false };
  const sets = score?.sets ?? [];
  const completedSets = sets?.filter((set) => set?.winningSide) ?? [];
  const setsWinCounts = completedSets.reduce(
    (counts, set) => {
      const { winningSide } = set;
      if (!winningSide) return counts;
      const winningSideIndex = winningSide - 1;
      counts[winningSideIndex]++;
      return counts;
    },
    [0, 0],
  );
  const matchUpWinningSideIndex = winningSide ? winningSide - 1 : undefined;
  const matchUpLosingSideIndex =
    matchUpWinningSideIndex !== undefined && [0, 1].includes(matchUpWinningSideIndex)
      ? 1 - matchUpWinningSideIndex
      : undefined;
  const winningSideSetsCount = matchUpWinningSideIndex !== undefined && setsWinCounts[matchUpWinningSideIndex];
  const losingSideSetsCount = matchUpLosingSideIndex !== undefined && setsWinCounts[matchUpLosingSideIndex];

  const matchUpScoringFormat = matchUpFormat ? parse(matchUpFormat) : undefined;
  if (matchUpScoringFormat?.setFormat?.combinedPointTotal) {
    if (sets.length !== 1) return { valid: false };
    const analysis = analyzeCombinedPointSet(sets[0], matchUpScoringFormat.setFormat);
    const status = matchUpStatus ?? existingMatchUpStatus;
    const irregular = !!status && [DEFAULTED, RETIRED, WALKOVER].includes(status);
    const validWinner = irregular || winningSide === analysis.winningSide;
    const validStatus = status !== COMPLETED || analysis.complete;
    return { valid: analysis.valid && validWinner && validStatus };
  }
  const maxSetsCount = Math.max(...setsWinCounts);
  const maxSetsInstances = instanceCount(setsWinCounts)[maxSetsCount];
  const timed = matchUpScoringFormat?.setFormat?.timed || matchUpScoringFormat?.finalSetFormat?.timed;

  // For calculating setsToWin, both bestOf and exactly use the same formula: Math.ceil(N/2)
  // - bestOf: play up to N sets, first to Math.ceil(N/2) wins
  // - exactly: always play N sets, winner is whoever won more (Math.ceil(N/2))
  // - except when exactly is even, in which case a tiebreak set may be played
  const totalSets = matchUpScoringFormat?.bestOf || matchUpScoringFormat?.exactly;
  const setsToWin = (totalSets && Math.ceil(totalSets / 2)) || 1;

  const relevantMatchUpStatus = matchUpStatus ?? existingMatchUpStatus;
  const irregularEnding = !!(relevantMatchUpStatus && [DEFAULTED, RETIRED, WALKOVER].includes(relevantMatchUpStatus));

  const validSets =
    !matchUpScoringFormat ||
    !sets.length ||
    sets.every((set, i) =>
      validateSet(set, i, matchUpScoringFormat, totalSets ?? 0, i === sets.length - 1, irregularEnding),
    );

  // For "exactly" formats, COMPLETED matches must have all N sets, and no match has more than N (plus the
  // sudden-death tiebreak of a format decided by aggregate points)
  const exactly = matchUpScoringFormat?.exactly;
  const isExactlyComplete =
    !exactly ||
    (sets.length <= (maxExactlySets(matchUpScoringFormat) ?? exactly) &&
      (!relevantMatchUpStatus || relevantMatchUpStatus !== COMPLETED || irregularEnding || sets.length >= exactly));

  // For aggregate scoring, calculate winner based on total score across all sets
  const isAggregateScoring = isAggregateFormat(matchUpScoringFormat);

  const calculatedWinningSide =
    isAggregateScoring && sets.length > 0
      ? calculateAggregateWinner(sets)
      : calculateStandardWinner(maxSetsCount, setsToWin, maxSetsInstances, setsWinCounts, matchUpFormat, !!exactly);

  const valid = !!(
    validSets &&
    isExactlyComplete &&
    ((winningSide && isAggregateScoring && winningSide === calculatedWinningSide) ||
      (winningSide &&
        !isAggregateScoring &&
        winningSideSetsCount > losingSideSetsCount &&
        winningSide === calculatedWinningSide) ||
      (winningSide && irregularEnding) ||
      (!winningSide &&
        !calculatedWinningSide &&
        (!relevantMatchUpStatus ||
          ![COMPLETED, DEFAULTED, RETIRED, WALKOVER].includes(relevantMatchUpStatus) ||
          (timed && relevantMatchUpStatus === COMPLETED))))
  );

  return { valid };
}
