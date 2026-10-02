import { checkScoreCompleteness } from '@Validators/scoreCompleteness';
import { isTiebreakGamesScore } from '@Query/matchUp/tiebreakAtRules';
import { formatForSet } from '@Query/matchUp/tiebreakSetShape';
import { analyzeScore } from '@Query/matchUp/analyzeScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { mustBeAnArray } from '@Tools/mustBeAnArray';
import { isConvertableInteger } from '@Tools/math';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_SCORE, INVALID_VALUES, MISSING_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { TIEBREAK_POINTS_NOT_RECORDED } from '@Constants/scoreWarningConstants';
import { ResultType, ResultWarning } from '@Types/factoryTypes';
import type { Score } from '@Types/tournamentTypes';

type validateScoreTypes = {
  existingMatchUpStatus?: string;
  matchUpStatus?: string;
  matchUpFormat?: string;
  winningSide?: number;
  score: Score;
};

/** The sets whose games are a tiebreak result — 7-6 under `@6` — and which carry no tiebreak points. */
function setsDecidedByTiebreakWithoutPoints(sets: any[], matchUpFormat?: string): number[] {
  const parsed = matchUpFormat ? parse(matchUpFormat) : undefined;
  if (!parsed) return [];
  return sets
    .map((set, index) => {
      const setFormat = formatForSet(parsed, set?.setNumber ?? index + 1);
      const { setTo, tiebreakAt } = setFormat ?? {};
      const hasPoints = [set?.side1TiebreakScore, set?.side2TiebreakScore].some((v) => v !== undefined && v !== null);
      const [a, b] = [set?.side1Score, set?.side2Score];
      if (hasPoints || typeof a !== 'number' || typeof b !== 'number' || typeof tiebreakAt !== 'number')
        return undefined;
      const decidedByTiebreak = isTiebreakGamesScore(Math.max(a, b), Math.min(a, b), { setTo, tiebreakAt });
      return decidedByTiebreak ? (set?.setNumber ?? index + 1) : undefined;
    })
    .filter((setNumber): setNumber is number => typeof setNumber === 'number');
}

const hasSetValues = (set: any) =>
  [set?.side1Score, set?.side2Score, set?.side1TiebreakScore, set?.side2TiebreakScore].some(
    (value) => value !== undefined && value !== null,
  );

/** The warning for sets decided by their tiebreak with no points recorded, or none (ruling V11). */
export function tiebreakPointsWarnings(sets: any[] = [], matchUpFormat?: string): ResultWarning[] {
  const setNumbers = setsDecidedByTiebreakWithoutPoints(sets, matchUpFormat);
  return setNumbers.length ? [{ code: TIEBREAK_POINTS_NOT_RECORDED, setNumbers }] : [];
}

function acceptedWithWarnings(sets: any[], matchUpFormat?: string): ResultType & { valid?: boolean } {
  const warnings = tiebreakPointsWarnings(sets, matchUpFormat);
  return warnings.length ? { valid: true, warnings } : { valid: true };
}

/** The shape of one set: numeric pairs on both sides or neither, point scores in pairs, a side for a winner. */
function checkSetValues(set: any): ResultType | undefined {
  const {
    side1Score,
    side2Score,
    side1TiebreakScore,
    side2TiebreakScore,
    side1PointScore,
    side2PointScore,
    winningSide,
    setNumber,
  } = set;

  // ensure that if one side has a numeric value then both sides should have a numeric value
  const numericValuePairs = [
    [side1Score, side2Score],
    [side1TiebreakScore, side2TiebreakScore],
  ]
    .filter((pair) => pair.some((value: any) => ![undefined, null].includes(value)))
    .every((pair) => pair.every((numericValue) => isConvertableInteger(numericValue)));

  if (!numericValuePairs) {
    return { error: INVALID_VALUES, info: 'non-numeric values' };
  }

  // point scores can be numeric (points-based formats) or string (tennis game scores: "AD", "40")
  const pointScorePair = [side1PointScore, side2PointScore];
  const hasPointScore = pointScorePair.some((v: any) => v !== undefined && v !== null);
  if (hasPointScore && !pointScorePair.every((v: any) => v !== undefined && v !== null)) {
    return { error: INVALID_VALUES, info: 'both sides must have point scores if one does' };
  }

  const numericValues = [setNumber, winningSide]
    .filter((value: any) => ![undefined, null].includes(value))
    .every((numericValue) => isConvertableInteger(numericValue));

  if (!numericValues) {
    return { error: INVALID_VALUES, info: 'non-numeric values' };
  }

  if (winningSide != null && ![1, 2].includes(winningSide))
    return { error: INVALID_VALUES, info: 'winningSide must be 1 or 2' };
  return undefined;
}

export function validateScore({
  existingMatchUpStatus,
  matchUpFormat,
  matchUpStatus,
  winningSide,
  score,
}: validateScoreTypes): ResultType & { valid?: boolean } {
  if (typeof score !== 'object') return { error: INVALID_VALUES };
  const { sets, scoreStringSide1, scoreStringSide2 } = score;
  const info = 'scoreString must be a string!';

  if (scoreStringSide1 !== undefined && typeof scoreStringSide1 !== 'string') return { error: INVALID_VALUES, info };
  if (scoreStringSide2 !== undefined && typeof scoreStringSide2 !== 'string') return { error: INVALID_VALUES, info };
  if (sets !== undefined && !Array.isArray(sets)) return { error: INVALID_VALUES, info: mustBeAnArray('sets') };

  if (sets?.length) {
    const setNumbers = sets.map((set) => set?.setNumber).filter(Boolean);
    if (setNumbers.length !== unique(setNumbers).length)
      return { error: INVALID_VALUES, info: 'setNumbers not unique' };

    for (const set of sets) {
      const setError = checkSetValues(set);
      if (setError) return setError;
    }

    // ── No format, no score (CA, 2026-10-02, ruling X1) ──
    //
    // Every check below is a question about the format: whether a set is finished, how many sets the
    // match plays, where its tiebreak is. Without one each of them answered "valid", so a score recorded
    // against no format was never checked at all. A write that means to record such a score — an import,
    // a migration — passes `disableScoreValidation`, which skips this call.
    if (!matchUpFormat && sets.some(hasSetValues)) {
      return {
        error: MISSING_MATCHUP_FORMAT,
        info: 'a score cannot be validated without a matchUpFormat on the matchUp, its structure, draw or event',
      };
    }

    const { valid: isValidScore } = analyzeScore({
      existingMatchUpStatus,
      matchUpStatus,
      matchUpFormat,
      winningSide,
      score,
    });

    if (!isValidScore) {
      return {
        error: INVALID_SCORE,
        info: 'score is invalid for matchUpFormat or winningSide does not match calculated winningSide',
      };
    }

    // Bounds are not completeness: a set must also be one the format can FINISH — see `scoreCompleteness`.
    // `disableScoreValidation` on `setMatchUpStatus` skips this call, and with it this rule.
    const { isComplete, info } = checkScoreCompleteness({ matchUpFormat, matchUpStatus, winningSide, sets });
    if (!isComplete) return { error: INVALID_SCORE, info };

    // Accepted, but worth saying: a set decided by its tiebreak with no tiebreak points (ruling V11)
    return acceptedWithWarnings(sets, matchUpFormat);
  }

  return { valid: true };
}
