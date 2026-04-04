import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { convertRange } from './convertRange';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ELO } from '@Constants/ratingConstants';

// see footnote #3 here:
// http://fivethirtyeight.com/features/serena-williams-and-the-difference-between-all-time-great-and-greatest-of-all-time/
const k538 = (countables = 0) => 250 / Math.pow(countables + 5, 0.4);
const kDefault = () => 1;

// win multipier is scaled by % countables won
// https://www.stat.berkeley.edu/~aldous/157/Old_Projects/huang.pdf
function kSet(maxCountables = 3, counted = 2) {
  const kset = maxCountables / counted;
  return Number.isNaN(kset) ? eloConfig.kDefault() : kset;
}

const eloConfig = {
  nSpread: 400, // determines the 'spread' of the scale
  diffThreshold: 0.125,

  kCalc: k538, // use calculation defined by FiveThirtyEight.com
  kMultiplier: kSet, // change to kDefault for value of 1
  kDefault,
};

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
  winnerCountables: number;
  loserCountables: number;
  maxCountables: number;
  ratingRange?: number[];
  winnerRating: number;
  countables?: number;
  loserRating: number;
  ratingType: string;
  ratings?: any;
};

export function calculateNewRatings(params: CalculateNewRatings) {
  let { winnerRating, loserRating } = params;
  const {
    ratings = ratingsParameters,
    winnerCountables = 1,
    loserCountables = 0,
    ratingType = ELO,
    maxCountables,
    countables,
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

  const getExpectation = (playerRating, opponentRating) =>
    1 / (1 + Math.pow(10, (opponentRating - playerRating) / eloConfig.nSpread));

  const winnerExpectation = getExpectation(convertedWinnerRating, convertedLoserRating);
  const loserExpectation = getExpectation(convertedLoserRating, convertedWinnerRating);

  const winnerKValue = eloConfig.kCalc(winnerCountables);
  const loserKValue = eloConfig.kCalc(loserCountables);
  const k = eloConfig.kMultiplier(maxCountables, countables);

  const winnerUpdatedConvertedRating = convertedWinnerRating + k * winnerKValue * (1 - winnerExpectation);
  const loserUpdatedConvertedRating = convertedLoserRating + k * loserKValue * (0 - loserExpectation);

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

  //  if expected winner && percentageDifference > threshold don't change ratings
  const percentageDifference = Math.max(...ratingRange)
    ? Math.abs(winnerRating - loserRating) / Math.max(...ratingRange)
    : 0;

  if (
    (convertedUpdatedWinnerRating > convertedUpdatedLoserRating && percentageDifference > eloConfig.diffThreshold) ||
    newWinnerRating < 0 ||
    newLoserRating < 0
  ) {
    newWinnerRating = winnerRating;
    newLoserRating = loserRating;
  }

  return { newWinnerRating, newLoserRating };
}
