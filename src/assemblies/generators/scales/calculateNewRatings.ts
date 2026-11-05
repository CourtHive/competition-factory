import { ExpectationRule, LOGISTIC_400, ratingUpdate } from './ratingUpdate';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { marginMultiplier } from './ratingsPolicyRules';
import { convertRange } from './convertRange';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ELO } from '@Constants/ratingConstants';

// types
import type { RatingsMarginRule } from '@Types/ratingsPolicyTypes';

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
  /** the winner's actual result, 1 unless the policy grades the win (e.g. by sets played) */
  winnerActual?: number;
  /** the loser's, 1 − winnerActual unless the policy scores it apart (FIFA's shootout loser, 0.5) */
  loserActual?: number;
  /** a margin rule and what it reads; the K multiplier is computed from the ratings in Elo space */
  margin?: { rule?: RatingsMarginRule; marginOfVictory?: number; winnerGameShare?: number };
  /** a side whose result fell short of its expectation keeps its rating (FIFA's knock-out loss protection) */
  protectLosses?: boolean;
  expectation?: ExpectationRule;
  ratingRange?: number[];
  winnerRating: number;
  loserRating: number;
  ratingType: string;
  winnerKFactor?: number;
  loserKFactor?: number;
  ratings?: any;
};

// the default policy's K (POLICY_RATINGS_DEFAULT: Huang 2014's flat-K run)
const DEFAULT_K = 25;

export function calculateNewRatings(params: CalculateNewRatings) {
  let { winnerRating, loserRating } = params;
  const {
    expectation = LOGISTIC_400,
    ratings = ratingsParameters,
    winnerKFactor = DEFAULT_K,
    loserKFactor = winnerKFactor,
    winnerActual = 1,
    loserActual = 1 - winnerActual,
    protectLosses,
    margin,
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

  const kMultiplier = marginMultiplier({ ...margin, winnerEloDiff: convertedWinnerRating - convertedLoserRating });
  const { deltas } = ratingUpdate({
    ratings: [convertedWinnerRating, convertedLoserRating],
    k: [winnerKFactor * kMultiplier, loserKFactor * kMultiplier],
    actual: [winnerActual, loserActual],
    expectation,
  });
  const [winnerDelta, loserDelta] = protectLosses ? deltas.map((delta) => Math.max(0, delta)) : deltas;

  const winnerUpdatedConvertedRating = convertedWinnerRating + winnerDelta;
  const loserUpdatedConvertedRating = convertedLoserRating + loserDelta;

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
