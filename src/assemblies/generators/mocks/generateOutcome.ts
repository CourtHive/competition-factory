import { getSetComplement, getTiebreakComplement } from '@Query/matchUp/getComplement';
import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { generateRange, randomPop } from '@Tools/arrays';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { randomInt, weightedRandom } from '@Tools/math';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { isExit } from '@Validators/isExit';

// constants and fixtures
import { INVALID_MATCHUP_FORMAT, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_WALKOVER,
  RETIRED,
  WALKOVER,
  INCOMPLETE,
  SUSPENDED,
  matchUpStatusConstants,
  completedMatchUpStatuses,
  DOUBLE_DEFAULT,
} from '@Constants/matchUpStatusConstants';

// percentages rounded to the nearest whole number
const defaultStatusProfile = {
  [WALKOVER]: 2,
  [DOUBLE_WALKOVER]: 1,
  [DOUBLE_DEFAULT]: 1,
  [RETIRED]: 1,
  [DEFAULTED]: 4,
};

const incompleteStatuses = new Set([RETIRED, DEFAULTED, INCOMPLETE, SUSPENDED]);
const doubleStatuses = new Set([DOUBLE_WALKOVER, DOUBLE_DEFAULT]);
const statusConstantKeys = new Set(Object.keys(matchUpStatusConstants));

function validateOutcomeParams({
  matchUpStatusProfile,
  defaultWithScorePercent,
  pointsPerMinute,
  sideWeight,
  matchUpFormat,
}) {
  if (!isValidMatchUpFormat({ matchUpFormat })) return { error: INVALID_MATCHUP_FORMAT };
  if (typeof matchUpStatusProfile !== 'object') return { error: INVALID_VALUES };
  if (
    Number.isNaN(Number(defaultWithScorePercent)) ||
    Number.isNaN(Number(pointsPerMinute)) ||
    Number.isNaN(Number(sideWeight))
  )
    return { error: INVALID_VALUES };

  return undefined;
}

function resolveMatchUpStatus({ matchUpStatusProfile, random }) {
  const matchUpStatuses = Object.keys(matchUpStatusProfile).filter(
    (matchUpStatus) => statusConstantKeys.has(matchUpStatus) && matchUpStatus !== COMPLETED,
  );
  const matchUpStatusTotals = Object.keys(matchUpStatuses).reduce((total, key) => total + matchUpStatusProfile[key], 0);
  if (matchUpStatusTotals > 100) return { error: INVALID_VALUES, matchUpStatusProfile };

  const matchUpStatusMap = matchUpStatuses.reduce(
    (statusMap: { pointer: number; valueMap: any[][] }, matchUpStatus) => {
      statusMap.pointer = statusMap.pointer + matchUpStatusProfile[matchUpStatus];
      statusMap.valueMap.push([statusMap.pointer, matchUpStatus]);
      return statusMap;
    },
    { pointer: 0, valueMap: [] },
  );

  const outcomePointer = randomInt(1, 100, random);
  const matchUpStatus: string = (matchUpStatusMap.valueMap.find((item) => outcomePointer <= item[0]) ?? [
    100,
    COMPLETED,
  ])[1];

  return { matchUpStatus };
}

function resolveAggregateWinningSide({ parsedFormat, winningSide, adjustSet, random, sets }) {
  let side1Total = sets.reduce((sum, s) => sum + (s.side1Score ?? 0), 0);
  let side2Total = sets.reduce((sum, s) => sum + (s.side2Score ?? 0), 0);
  const maxSetScore = parsedFormat?.setFormat?.outs ? parsedFormat.setFormat.outs * 3 : undefined;

  if (winningSide) {
    const needsAdjustment =
      (winningSide === 1 && side1Total <= side2Total) || (winningSide === 2 && side2Total <= side1Total);

    if (needsAdjustment) {
      adjustAggregateForWinningSide({ sets, winningSide, side1Total, side2Total, maxSetScore, adjustSet, random });
    }
    return winningSide;
  }

  if (side1Total === side2Total) {
    const side = randomInt(1, 2, random);
    adjustAggregateBounded(sets, side, 1, maxSetScore, adjustSet);
    return side;
  }

  return side1Total > side2Total ? 1 : 2;
}

function adjustAggregateForWinningSide({ maxSetScore, side1Total, side2Total, winningSide, adjustSet, random, sets }) {
  if (maxSetScore) {
    // Bounded format: swap scores if wrong side leads (preserves bounds)
    if (side1Total !== side2Total) {
      for (const s of sets) {
        [s.side1Score, s.side2Score] = [s.side2Score, s.side1Score];
        if (s.winningSide) s.winningSide = s.winningSide === 1 ? 2 : 1;
      }
    }
    // Break any remaining tie within bounds
    const newSide1Total = sets.reduce((sum, s) => sum + (s.side1Score ?? 0), 0);
    const newSide2Total = sets.reduce((sum, s) => sum + (s.side2Score ?? 0), 0);
    if (newSide1Total === newSide2Total) {
      adjustAggregateBounded(sets, winningSide, 1, maxSetScore, adjustSet);
    }
  } else {
    const diff = Math.abs(side1Total - side2Total) + randomInt(1, 3, random);
    if (winningSide === 1) sets[adjustSet].side1Score += diff;
    else sets[adjustSet].side2Score += diff;
  }
}

/**
 *
 * @param {string} matchUpFormat - optional - TODS matchUpFormat code string - defaults to 'SET3-S:6/TB7'
 * @param {object} matchUpStatusProfile - optional - whole number percent for each target matchUpStatus { [matchUpStatus]: percentLikelihood }
 * @param {integer} pointsPerMinute - optional - value used for generating timed sets scores
 * @param {integer} sideWeight - optional - the larger the number the less likely a deciding (e.g. 3rd) set is generated
 * @param {integer} winningSide - optional - 1 or 2 forces the winningSide
 * @param {integer} defaultWithScorePercent - optional - percentage of the time a DEFAULT should include a score
 *
 * @returns {object} outcome - { score, winningSide, matchUpStatus }
 */
export function generateOutcome(params) {
  const { winningSide: paramWinningSide, defaultWithScorePercent: rawDefaultPercent = 2 } = params;
  const {
    matchUpStatusProfile = defaultStatusProfile, // { matchUpStatusProfile: {} } will always return only { matchUpStatus: COMPLETED }
    matchUpFormat = FORMAT_STANDARD,
    pointsPerMinute = 2.5,
    sideWeight = 4,
    random,
  } = params;

  const clampedDefaultPercent = Math.min(rawDefaultPercent, 100);

  const validation = validateOutcomeParams({
    defaultWithScorePercent: clampedDefaultPercent,
    matchUpStatusProfile,
    pointsPerMinute,
    matchUpFormat,
    sideWeight,
  });
  if (validation?.error) return validation;

  const statusResult = resolveMatchUpStatus({ matchUpStatusProfile, random });
  if (statusResult.error) return statusResult;
  const { matchUpStatus } = statusResult as { matchUpStatus: string };

  const earlyOutcome = resolveEarlyOutcome({
    defaultWithScorePercent: clampedDefaultPercent,
    winningSide: paramWinningSide,
    matchUpStatus,
    random,
  });
  if (earlyOutcome) return earlyOutcome;

  const winningSide = isExit(matchUpStatus) ? paramWinningSide || randomInt(1, 2, random) : paramWinningSide;

  return generateScoredOutcome({
    pointsPerMinute,
    matchUpFormat,
    matchUpStatus,
    winningSide,
    sideWeight,
    random,
  });
}

function resolveEarlyOutcome({ matchUpStatus, winningSide, defaultWithScorePercent, random }) {
  const noScore = { sets: [], scoreStringSide1: '', side2ScoreString: '' };

  if (isExit(matchUpStatus)) {
    const resolvedWinningSide = winningSide || randomInt(1, 2, random);
    const outcome = {
      score: noScore,
      matchUpStatus,
      winningSide: resolvedWinningSide,
    };

    const scoreDefaulted = matchUpStatus === DEFAULTED && randomInt(1, 100, random) > 100 - defaultWithScorePercent;
    if (!scoreDefaulted) return { outcome };
  } else if (doubleStatuses.has(matchUpStatus)) {
    return { outcome: { score: noScore, matchUpStatus } };
  }

  return undefined;
}

function generateScoredOutcome({ pointsPerMinute, matchUpFormat, matchUpStatus, winningSide, sideWeight, random }) {
  const parsedFormat = parse(matchUpFormat);
  const { bestOf = 1, exactly, setFormat, finalSetFormat } = parsedFormat ?? {};

  const sets: any[] = [];
  const weightedSide = randomInt(0, 1, random);
  const weightedRange = winningSide
    ? [winningSide - 1]
    : [...generateRange(0, sideWeight).map(() => weightedSide), 1 - weightedSide];

  const incompleteSet = incompleteStatuses.has(matchUpStatus);

  // if there is to be an incomplete set randomize which set is incomplete
  // for 3 sets this will always be setNumber 1 or setNumber 2
  // because it is not known in advance whether 3 sets will be generated
  const incompleteAt = incompleteSet && (randomPop(generateRange(1, exactly || bestOf), random) || 1);

  // used to capture winner by RETIREMENT or DEFAULT
  let weightedWinningSide;

  const setsToGenerate = generateRange(1, (exactly ?? bestOf) + 1);
  for (const setNumber of setsToGenerate) {
    const isFinalSet = setNumber === (exactly ?? bestOf);
    const { set, incomplete, winningSideNumber } = generateSet({
      setFormat: (isFinalSet && finalSetFormat) || setFormat,
      incomplete: incompleteAt === setNumber,
      pointsPerMinute,
      matchUpStatus,
      weightedRange,
      setNumber,
      random,
    }) as any;
    sets.push(set);

    if (incomplete) {
      weightedWinningSide = winningSideNumber;
      break;
    }

    const analysis = analyzeMatchUp({ matchUp: { score: { sets }, matchUpFormat } });
    // For aggregate formats (e.g. SET2XA-S:T10), always play all sets — winner is by total points
    if (analysis.calculatedWinningSide && !parsedFormat?.aggregate) break;
  }

  const matchUpWinningSide = determineMatchUpWinningSide({
    weightedWinningSide,
    matchUpFormat,
    parsedFormat,
    winningSide,
    random,
    sets,
  });

  // add the side perspective stringScores
  const { score } = matchUpScore({
    winningSide: matchUpWinningSide,
    score: { sets },
    matchUpStatus,
  });

  const outcome = {
    winningSide: matchUpWinningSide,
    matchUpStatus,
    score,
  };

  return { outcome };
}

function determineMatchUpWinningSide({ weightedWinningSide, matchUpFormat, parsedFormat, winningSide, random, sets }) {
  if (weightedWinningSide) {
    return winningSide || weightedWinningSide;
  }

  if (parsedFormat?.aggregate && sets.length > 0) {
    const adjustSet = randomInt(0, sets.length - 1, random);
    return resolveAggregateWinningSide({
      parsedFormat,
      winningSide,
      adjustSet,
      random,
      sets,
    });
  }

  const analysis = analyzeMatchUp({ matchUp: { score: { sets }, matchUpFormat, winningSide } });
  return analysis.calculatedWinningSide;
}

/**
 *
 * @param {integer} setNumber
 * @param {object} setFormat
 * @param {integer[]} weightedRange - weights one side to reduce the number of "deciding sets", e.g. 3 set matchUps
 * @returns
 */
function generateSet({
  weightedRange = [0, 1],
  pointsPerMinute,
  matchUpStatus,
  incomplete,
  setFormat,
  setNumber,
  random,
}) {
  const set: any = { setNumber };
  const { setTo, tiebreakFormat, tiebreakAt, tiebreakSet, timed, minutes, outs } = setFormat;

  // will tend to be more likely to either reverse or not revderse all sets
  // preserves randomness of winningSide while reducing deciding set outcomes
  const weightIndex = randomInt(0, weightedRange.length - 1, random);
  const reverseScores = weightedRange[weightIndex];

  if (timed) {
    return generateTimedSet({
      set,
      minutes,
      pointsPerMinute,
      reverseScores,
      weightedRange,
      weightIndex,
      incomplete,
      matchUpStatus,
      random,
    });
  }

  if (outs) {
    return generateOutsSet({ set, outs, reverseScores, weightedRange, weightIndex, incomplete, matchUpStatus, random });
  }

  if (incomplete) {
    return generateIncompleteStandardSet({ set, tiebreakAt, weightedRange, weightIndex, matchUpStatus, random });
  }

  return generateStandardSet({
    tiebreakFormat,
    reverseScores,
    weightedRange,
    weightIndex,
    tiebreakSet,
    tiebreakAt,
    setFormat,
    random,
    setTo,
    set,
  });
}

function generateTimedSet({
  pointsPerMinute,
  reverseScores,
  weightedRange,
  matchUpStatus,
  weightIndex,
  incomplete,
  minutes,
  random,
  set,
}) {
  const calcPoints = minutes * pointsPerMinute;
  const pointsVariation = Math.round(calcPoints * 0.2);
  const totalPoints = calcPoints + randomPop([1, -1], random) * pointsVariation;
  // the use of weightedRandom applies a bell curve distribution to the difference in side scores
  // the larger the second value, the more pronounced the bell curve will be
  const sidePoints = weightedRandom(totalPoints, 2, undefined, random);
  const scores = [sidePoints, totalPoints - sidePoints];

  if (reverseScores) scores.reverse();
  const winningSideNumber = weightedRange[weightIndex] + 1;

  if (incomplete) {
    const [side1Score, side2Score] = scores;
    Object.assign(set, { side1Score, side2Score });
    if (completedMatchUpStatuses.includes(matchUpStatus)) {
      return { set, incomplete, winningSideNumber };
    }

    return { set, incomplete };
  }

  // sides could be tied
  const highSide = (scores[0] > scores[1] && 1) || (scores[1] > scores[0] && 2) || 0;
  if (!highSide) scores[randomInt(0, 1, random)] += 1;
  const resolvedHighSide = scores[0] > scores[1] ? 1 : 2; // sides are not tied
  if (resolvedHighSide !== winningSideNumber) scores.reverse();

  const [side1Score, side2Score] = scores;
  Object.assign(set, {
    side1Score,
    side2Score,
    winningSide: winningSideNumber,
  });

  return { set };
}

function generateOutsSet({ reverseScores, weightedRange, matchUpStatus, weightIndex, incomplete, random, outs, set }) {
  // Outs-based scoring (e.g., wiffle ball innings with 3 outs)
  // Generates single-digit scores (0 to outs * 3)
  const maxScore = outs * 3;
  const scores = [randomInt(0, maxScore, random), randomInt(0, maxScore, random)];

  const winningSideNumber = weightedRange[weightIndex] + 1;
  if (reverseScores) scores.reverse();

  if (incomplete) {
    const [side1Score, side2Score] = scores;
    Object.assign(set, { side1Score, side2Score });
    if (completedMatchUpStatuses.includes(matchUpStatus)) {
      return { set, incomplete, winningSideNumber };
    }
    return { set, incomplete };
  }

  const [side1Score, side2Score] = scores;
  Object.assign(set, { side1Score, side2Score });
  if (side1Score !== side2Score) {
    set.winningSide = side1Score > side2Score ? 1 : 2;
  }

  return { set };
}

function generateIncompleteStandardSet({ matchUpStatus, weightedRange, tiebreakAt, weightIndex, random, set }) {
  set.side1Score = randomInt(0, tiebreakAt, random);
  set.side2Score = randomInt(0, tiebreakAt, random);

  let winningSideNumber;
  if (completedMatchUpStatuses.includes(matchUpStatus)) {
    winningSideNumber = weightedRange[weightIndex] + 1;
  }

  return { set, incomplete: true, winningSideNumber };
}

function generateStandardSet({
  tiebreakFormat,
  reverseScores,
  weightedRange,
  weightIndex,
  tiebreakSet,
  tiebreakAt,
  setFormat,
  random,
  setTo,
  set,
}) {
  // weight the range of possible low scores such that tiebreak sets are less likely
  const range = generateRange(1, setTo + 1).flatMap((value) => generateRange(0, setTo + 2 - value).map(() => value));
  const lowValue = range[randomInt(0, range.length - 1, random)];

  const scores =
    setTo &&
    getSetComplement({
      isSide1: true,
      tiebreakAt,
      lowValue,
      setTo,
    });
  const isTiebreakSet = !scores;
  const specifiedWinningSide = weightedRange.length === 1 && weightedRange[weightIndex] + 1;

  if (scores) {
    applyScoreOrientation({ scores, specifiedWinningSide, reverseScores });
    const [side1Score, side2Score] = scores;
    Object.assign(set, { side1Score, side2Score });
  }

  const setAnalysis = analyzeSet({
    matchUpScoringFormat: { setFormat },
    setObject: set,
  });

  let tiebreakWinningSide;
  if (setAnalysis.hasTiebreakCondition || isTiebreakSet) {
    tiebreakWinningSide = applyTiebreak({
      specifiedWinningSide,
      tiebreakFormat,
      reverseScores,
      isTiebreakSet,
      tiebreakSet,
      setAnalysis,
      random,
      set,
    });
  }

  set.winningSide = setAnalysis.winningSide || setAnalysis.leadingSide || specifiedWinningSide || tiebreakWinningSide;
  return { set };
}

function applyScoreOrientation({ scores, specifiedWinningSide, reverseScores }) {
  if (specifiedWinningSide) {
    const highSide = scores[0] > scores[1] ? 1 : 2;
    if (highSide !== specifiedWinningSide) scores.reverse();
  } else if (reverseScores) {
    scores.reverse();
  }
}

function applyTiebreak({
  specifiedWinningSide,
  tiebreakFormat,
  reverseScores,
  isTiebreakSet,
  tiebreakSet,
  setAnalysis,
  random,
  set,
}) {
  const { NoAD: tiebreakNoAd, tiebreakTo } = tiebreakFormat || tiebreakSet || {};
  const range = generateRange(1, tiebreakTo + 1).flatMap((value) =>
    generateRange(0, tiebreakTo + 2 - value).map(() => value),
  );
  const lowValue = range[randomInt(0, range.length - 1, random)];
  const scores = getTiebreakComplement({
    isSide1: true,
    tiebreakNoAd,
    tiebreakTo,
    lowValue,
  });

  if (!scores) return undefined;

  if (isTiebreakSet) {
    applyScoreOrientation({ scores, specifiedWinningSide, reverseScores });
    [set.side1TiebreakScore, set.side2TiebreakScore] = scores;
    return (scores[0] > scores[1] && 1) || (scores[1] > scores[0] && 2) || undefined;
  }

  if (setAnalysis.leadingSide === 2) {
    [set.side1TiebreakScore, set.side2TiebreakScore] = scores;
  } else {
    [set.side2TiebreakScore, set.side1TiebreakScore] = scores;
  }

  return undefined;
}

/**
 * Adjusts aggregate scores by `diff` favoring `side`, keeping all scores within bounds.
 * For unbounded formats (maxSetScore undefined), falls back to simple increment.
 */
function adjustAggregateBounded(sets, side, diff, maxSetScore, adjustSet) {
  const winKey = side === 1 ? 'side1Score' : 'side2Score';
  const loseKey = side === 1 ? 'side2Score' : 'side1Score';

  if (!maxSetScore) {
    sets[adjustSet][winKey] += diff;
    return;
  }

  let remaining = diff;
  // Prefer decrementing the losing side to stay within score bounds
  for (let i = 0; remaining > 0 && i < sets.length; i++) {
    const idx = (adjustSet + i) % sets.length;
    const available = sets[idx][loseKey] ?? 0;
    if (available > 0) {
      const sub = Math.min(remaining, available);
      sets[idx][loseKey] -= sub;
      remaining -= sub;
    }
  }
  // If still needed, increment the winning side
  for (let i = 0; remaining > 0 && i < sets.length; i++) {
    const idx = (adjustSet + i) % sets.length;
    const headroom = maxSetScore - (sets[idx][winKey] ?? 0);
    if (headroom > 0) {
      const add = Math.min(remaining, headroom);
      sets[idx][winKey] += add;
      remaining -= add;
    }
  }
}
