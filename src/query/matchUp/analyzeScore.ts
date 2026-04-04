import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { instanceCount } from '@Tools/arrays';

// constants and types
import { COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { Score } from '@Types/tournamentTypes';

type AnalyzeScoreArgs = {
  existingMatchUpStatus?: string;
  matchUpStatus?: string;
  matchUpFormat?: string;
  winningSide?: number;
  score: Score;
};

function validateTiebreak(
  tiebreakFormat: any,
  side1TiebreakScore: number,
  side2TiebreakScore: number,
  setWinningSide: number,
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
  set: any,
  i: number,
  matchUpScoringFormat: any,
  totalSets: number,
  isLastSet: boolean,
  irregularEnding: boolean,
): boolean {
  const setNumber = i + 1;
  const isFinalSet = setNumber === totalSets;

  const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore, winningSide: setWinningSide } = set;
  const maxSetScore = Math.max(side1Score ?? 0, side2Score ?? 0);
  const hasTiebreak = side1TiebreakScore ?? side2TiebreakScore;

  const { finalSetFormat, setFormat } = matchUpScoringFormat;
  const setValues = isFinalSet ? finalSetFormat || setFormat : setFormat;

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

  if (!setValues.setTo) return true;

  const excessiveSetScore = !setValues.noTiebreak && maxSetScore > setValues.setTo + 1;
  return !excessiveSetScore;
}

function calculateAggregateWinner(sets: any[]): number | undefined {
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
): number | undefined {
  return (
    ((!matchUpFormat || maxSetsCount === setsToWin) &&
      maxSetsInstances === 1 &&
      setsWinCounts.indexOf(maxSetsCount) + 1) ||
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

  // For "exactly" formats, COMPLETED matches must have all N sets
  const exactly = matchUpScoringFormat?.exactly;
  const isExactlyComplete =
    !exactly ||
    !relevantMatchUpStatus ||
    relevantMatchUpStatus !== COMPLETED ||
    irregularEnding ||
    sets.length >= exactly;

  // For aggregate scoring, calculate winner based on total score across all sets
  const isAggregateScoring = isAggregateFormat(matchUpScoringFormat);

  const calculatedWinningSide =
    isAggregateScoring && sets.length > 0
      ? calculateAggregateWinner(sets)
      : calculateStandardWinner(maxSetsCount, setsToWin, maxSetsInstances, setsWinCounts, matchUpFormat);

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
        (![COMPLETED, DEFAULTED, RETIRED, WALKOVER].includes(relevantMatchUpStatus) ||
          (timed && relevantMatchUpStatus === COMPLETED))))
  );

  return { valid };
}
