import { analyzeScore } from '@Query/matchUp/analyzeScore';
import { mustBeAnArray } from '@Tools/mustBeAnArray';
import { isConvertableInteger } from '@Tools/math';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_SCORE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { Score } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type validateScoreTypes = {
  existingMatchUpStatus?: string;
  matchUpStatus?: string;
  matchUpFormat?: string;
  winningSide?: number;
  score: Score;
};

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

      if (winningSide && ![1, 2].includes(winningSide))
        return { error: INVALID_VALUES, info: 'winningSide must be 1 or 2' };
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
  }

  return { valid: true };
}
