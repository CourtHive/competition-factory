import { ExpectationRule, LOGISTIC_400, ratingUpdate } from './ratingUpdate';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { convertRange } from './convertRange';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ELO } from '@Constants/ratingConstants';

/**
export function getRatingDelta({ ratings = ratingsParameters, ratingType, rating, delta }) {
  const ratingParameters = ratings?.[ratingType];
  const decimalPlaces = ratingParameters.decimalsCount || 0;
  let newRating = (parseFloat(rating) + parseFloat(delta)).toFixed(decimalPlaces);
  if (parseFloat(newRating) < 0) newRating = rating;
  return newRating;
}
 */

type CalculateNewRatings = {
  /** the winner's actual result, 1 unless the policy grades the win (e.g. by sets played); the loser takes 1 − it */
  winnerActual?: number;
  expectation?: ExpectationRule;
  ratingRange?: number[];
  winnerRating: number;
  loserRating: number;
  ratingType: string;
  winnerK?: number;
  loserK?: number;
  ratings?: any;
};

// the default policy's K (POLICY_RATINGS_DEFAULT: Huang 2014's flat-K run)
const DEFAULT_K = 25;

export function calculateNewRatings(params: CalculateNewRatings) {
  let { winnerRating, loserRating } = params;
  const {
    expectation = LOGISTIC_400,
    ratings = ratingsParameters,
    winnerK = DEFAULT_K,
    loserK = winnerK,
    winnerActual = 1,
    ratingType = ELO,
  } = params ?? {};
  const ratingParameters = ratings?.[ratingType];
  if (!ratingParameters) return { error: MISSING_VALUE };

  const ratingRange = ratingParameters.range || params.ratingRange;
  winnerRating = winnerRating || ratingParameters.defaultInitialization;
  loserRating = loserRating || ratingParameters.defaultInitialization;

  const invertedScale = ratingRange[0] > ratingRange[1];

  const decimalPlaces = ratingParameters.decimalsCount || 0;
  const consideredRange = invertedScale ? ratingRange.slice().reverse() : ratingRange;

  const inRange = (range, value) =>
    Number.parseFloat(value) >= Math.min(...range) && Number.parseFloat(value) <= Math.max(...range);
  if (!inRange(ratingRange, winnerRating) || !inRange(ratingRange, loserRating)) {
    if (!inRange(ratingRange, winnerRating)) winnerRating = ratingParameters.defaultInitialization;
    if (!inRange(ratingRange, loserRating)) loserRating = ratingParameters.defaultInitialization;
  }

  // convert inbound ratings from ratingType into ELO
  const convertedWinnerRating = convertRange({
    targetRange: ratingsParameters[ELO].range,
    sourceRange: consideredRange,
    value: invertedScale ? ratingRange[0] - winnerRating : winnerRating,
  });
  const convertedLoserRating = convertRange({
    targetRange: ratingsParameters[ELO].range,
    sourceRange: consideredRange,
    value: invertedScale ? ratingRange[0] - loserRating : loserRating,
  });

  const { deltas } = ratingUpdate({
    ratings: [convertedWinnerRating, convertedLoserRating],
    actual: [winnerActual, 1 - winnerActual],
    k: [winnerK, loserK],
    expectation,
  });

  const winnerUpdatedConvertedRating = convertedWinnerRating + deltas[0];
  const loserUpdatedConvertedRating = convertedLoserRating + deltas[1];

  // convert calculated new ratings from ELO into ratingType
  const convertedUpdatedWinnerRating = convertRange({
    sourceRange: ratingsParameters[ELO].range,
    value: winnerUpdatedConvertedRating,
    targetRange: consideredRange,
  });
  const convertedUpdatedLoserRating = convertRange({
    sourceRange: ratingsParameters[ELO].range,
    value: loserUpdatedConvertedRating,
    targetRange: consideredRange,
  });

  const updatedWinnerRating = invertedScale
    ? ratingRange[0] - convertedUpdatedWinnerRating
    : convertedUpdatedWinnerRating;
  let newWinnerRating = Number.parseFloat(updatedWinnerRating.toFixed(decimalPlaces));
  const updatedLoserRating = invertedScale ? ratingRange[0] - convertedUpdatedLoserRating : convertedUpdatedLoserRating;
  let newLoserRating = Number.parseFloat(updatedLoserRating.toFixed(decimalPlaces));

  // a rating that would leave the scale's range is not written
  if (newWinnerRating < 0 || newLoserRating < 0) {
    newWinnerRating = winnerRating;
    newLoserRating = loserRating;
  }

  return { newWinnerRating, newLoserRating };
}
