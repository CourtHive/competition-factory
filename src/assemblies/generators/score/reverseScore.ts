import { generateScoreString } from '../matchUps/generateScoreString';
import { definedAttributes } from '@Tools/definedAttributes';

// Contants
import { ErrorType, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function reverseScore(params?): {
  reversedScore?: any;
  success?: boolean;
  error?: ErrorType;
} {
  if (!params?.score) return { error: MISSING_VALUE };
  const { sets } = params.score;
  const reversedSets = sets.map((set) => {
    const {
      side1TiebreakScore,
      side2TiebreakScore,
      side1PointScore,
      side2PointScore,
      winningSide,
      side1Score,
      side2Score,
      setNumber,
    } = set;
    return definedAttributes({
      winningSide: winningSide ? 3 - winningSide : undefined,
      side1TiebreakScore: side2TiebreakScore,
      side2TiebreakScore: side1TiebreakScore,
      side1PointScore: side2PointScore,
      side2PointScore: side1PointScore,
      side1Score: side2Score,
      side2Score: side1Score,
      setNumber,
    });
  });

  const setTBlast = params?.setTBlast;
  const scoreStringSide1 = generateScoreString({ setTBlast, sets: reversedSets });
  const scoreStringSide2 = generateScoreString({
    sets: reversedSets,
    reversed: true,
    setTBlast,
  });

  return {
    reversedScore: { sets: reversedSets, scoreStringSide1, scoreStringSide2 },
    ...SUCCESS,
  };
}
