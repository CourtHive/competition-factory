import { predictBandsFromDelta, BandPrediction, PredictionModel } from '@Query/matchUp/competitiveBandsPrediction';
import { findPolicy } from '@Acquire/findPolicy';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { Tournament } from '@Types/tournamentTypes';
import {
  ADAPTIVE,
  COMPASS,
  DOUBLE_ELIMINATION,
  DOUBLE_ROUND_ROBIN,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  SWISS,
} from '@Constants/drawDefinitionConstants';

// Fixtures
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';

const BALANCED_BRACKET_TYPES = new Set<string>([
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  COMPASS,
  LUCKY_DRAW,
  ADAPTIVE,
]);

const ROUND_ROBIN_TYPES = new Set<string>([ROUND_ROBIN, DOUBLE_ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF]);

const MIN_DELTA_TYPES = new Set<string>([SWISS]);

export type ProjectionMode = 'BALANCED_BRACKET' | 'ROUND_ROBIN' | 'MIN_DELTA';

type ProjectedPair = [number, number];

type PredictDrawCompetitiveBandsArgs = {
  predictionModel?: PredictionModel;
  projectionMode?: ProjectionMode;
  tournamentRecord?: Tournament;
  groupSize?: number;
  ratings: number[];
  drawType?: string;
  drawSize?: number;
};

type PredictDrawCompetitiveBandsResult = BandPrediction & {
  perMatchUpPredictions?: BandPrediction[];
  projectionMode?: ProjectionMode;
  projectedPairs?: ProjectedPair[];
  expectedMatchCount?: number;
  error?: ErrorType;
};

const DEFAULT_PREDICTION_MODEL: PredictionModel =
  POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].predictionModel;

function resolvePredictionModel(
  predictionModel: PredictionModel | undefined,
  tournamentRecord: Tournament | undefined,
): PredictionModel {
  if (predictionModel) return predictionModel;

  if (tournamentRecord) {
    const { policy } = findPolicy({
      policyType: POLICY_TYPE_COMPETITIVE_BANDS,
      tournamentRecord,
    });
    if (policy?.predictionModel) return policy.predictionModel;
  }

  return DEFAULT_PREDICTION_MODEL;
}

function resolveProjectionMode(drawType: string): ProjectionMode | undefined {
  if (BALANCED_BRACKET_TYPES.has(drawType)) return 'BALANCED_BRACKET';
  if (ROUND_ROBIN_TYPES.has(drawType)) return 'ROUND_ROBIN';
  if (MIN_DELTA_TYPES.has(drawType)) return 'MIN_DELTA';
  return undefined;
}

// Pairs the i-th highest rating with the i-th lowest, mirroring the
// R1 outcome of standard seed placement (top half plays bottom half).
function projectBalancedBracket(sorted: number[]): ProjectedPair[] {
  const pairs: ProjectedPair[] = [];
  const half = Math.floor(sorted.length / 2);
  for (let i = 0; i < half; i++) {
    pairs.push([sorted[i], sorted[sorted.length - 1 - i]]);
  }
  return pairs;
}

// Pairs adjacent ratings — minimum delta. Mirrors DrawMatic's
// rating-balanced pairing for R1 (and a reasonable Swiss R1 fallback
// when a record-respecting variant is requested without records).
function projectMinDelta(sorted: number[]): ProjectedPair[] {
  const pairs: ProjectedPair[] = [];
  const evenLength = sorted.length - (sorted.length % 2);
  for (let i = 0; i < evenLength; i += 2) {
    pairs.push([sorted[i], sorted[i + 1]]);
  }
  return pairs;
}

function projectRoundRobinGroup(group: number[]): ProjectedPair[] {
  const pairs: ProjectedPair[] = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      pairs.push([group[i], group[j]]);
    }
  }
  return pairs;
}

function projectRoundRobin(sorted: number[], groupSize: number | undefined): ProjectedPair[] {
  if (!groupSize || groupSize < 2) return projectRoundRobinGroup(sorted);

  const pairs: ProjectedPair[] = [];
  for (let start = 0; start < sorted.length; start += groupSize) {
    const group = sorted.slice(start, start + groupSize);
    if (group.length >= 2) {
      pairs.push(...projectRoundRobinGroup(group));
    }
  }
  return pairs;
}

function projectPairs(sortedRatings: number[], mode: ProjectionMode, groupSize: number | undefined): ProjectedPair[] {
  if (mode === 'BALANCED_BRACKET') return projectBalancedBracket(sortedRatings);
  if (mode === 'ROUND_ROBIN') return projectRoundRobin(sortedRatings, groupSize);
  return projectMinDelta(sortedRatings);
}

function aggregatePredictions(predictions: BandPrediction[]): BandPrediction {
  if (predictions.length === 0) return { competitive: 0, decisive: 0, routine: 0 };

  const totals = predictions.reduce(
    (acc, p) => {
      acc.competitive += p.competitive;
      acc.decisive += p.decisive;
      acc.routine += p.routine;
      return acc;
    },
    { competitive: 0, decisive: 0, routine: 0 },
  );

  const n = predictions.length;
  return {
    competitive: totals.competitive / n,
    decisive: totals.decisive / n,
    routine: totals.routine / n,
  };
}

// Projects the band-distribution of a draw before any matches are
// played. Projection mode is chosen by drawType:
//   - BALANCED_BRACKET (SE/Compass/Lucky/Adaptive/etc.): R1 only,
//     pairing the highest seed with the lowest, second with second-
//     to-last, and so on. Mirrors what standard seed placement
//     produces in the first round.
//   - ROUND_ROBIN: every pair in each group, using groupSize when
//     supplied. All scheduled matchUps are deterministic.
//   - MIN_DELTA (Swiss/DrawMatic R1): adjacent-rating pairing —
//     the natural rating-balanced first round before any record-
//     based pairing kicks in.
//
// Singles only. Group-rating arithmetic and Monte Carlo simulation
// of later rounds are out of scope for this phase.
export function predictDrawCompetitiveBands({
  tournamentRecord,
  projectionMode,
  predictionModel,
  groupSize,
  ratings,
  drawType,
}: PredictDrawCompetitiveBandsArgs): PredictDrawCompetitiveBandsResult {
  if (!Array.isArray(ratings) || ratings.length < 2) {
    return { competitive: 0, decisive: 0, routine: 0, error: INVALID_VALUES };
  }

  const resolvedMode = projectionMode ?? (drawType ? resolveProjectionMode(drawType) : undefined);
  if (!resolvedMode) {
    return { competitive: 0, decisive: 0, routine: 0, error: INVALID_VALUES };
  }

  const model = resolvePredictionModel(predictionModel, tournamentRecord);

  const sorted = [...ratings].sort((a, b) => b - a);
  const projectedPairs = projectPairs(sorted, resolvedMode, groupSize);
  const perMatchUpPredictions = projectedPairs.map(([r1, r2]) => predictBandsFromDelta(Math.abs(r1 - r2), model));

  const aggregate = aggregatePredictions(perMatchUpPredictions);

  return {
    ...aggregate,
    perMatchUpPredictions,
    projectionMode: resolvedMode,
    projectedPairs,
    expectedMatchCount: projectedPairs.length,
  };
}
