import { predictBandsFromDelta, BandPrediction, PredictionModel } from './competitiveBandsPrediction';
import { DeltaBand, resolveDeltaBand, signedRatingDelta } from './resolveDeltaBand';
import { resolveDeltaBands } from './resolveCompetitiveBands';
import { findPolicy } from '@Acquire/findPolicy';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

// Fixtures
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';

type PredictMatchUpCompetitiveBandsArgs = {
  policyDefinitions?: PolicyDefinitions;
  predictionModel?: PredictionModel;
  tournamentRecord?: Tournament;
  deltaBands?: DeltaBand[];
  side1Rating?: number;
  side2Rating?: number;
  ascending?: boolean;
  scaleName?: string;
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

// Predicts band probabilities {competitive, decisive, routine} for a
// single (projected) matchUp from the rating delta of the two sides.
// The shape of the curve is policy-controlled — see the predictionModel
// block on POLICY_COMPETITIVE_BANDS. Singles only (one rating per side).
//
// `delta` is the ABSOLUTE delta, unchanged: competitiveness is symmetric, so a
// 4-point gap is equally uncompetitive whichever side it favours. The signed
// exposure axis is a separate question — "who did side 1 play up against?" —
// and is returned ADDITIVELY as `signedDelta` (+ `deltaBand`) when a
// `scaleName` or explicit `ascending` establishes which direction is stronger.
export function predictMatchUpCompetitiveBands({
  policyDefinitions,
  tournamentRecord,
  predictionModel,
  side1Rating,
  side2Rating,
  deltaBands,
  ascending,
  scaleName,
}: PredictMatchUpCompetitiveBandsArgs): BandPrediction & {
  signedDelta?: number;
  deltaBand?: string;
  error?: ErrorType;
  delta?: number;
  info?: string;
} {
  if (typeof side1Rating !== 'number' || typeof side2Rating !== 'number') {
    return { competitive: 0, decisive: 0, routine: 0, error: INVALID_VALUES };
  }

  const model = resolvePredictionModel(predictionModel, tournamentRecord);
  const delta = Math.abs(side1Rating - side2Rating);
  const bands = predictBandsFromDelta(delta, model);

  const orientationRequested = scaleName !== undefined || typeof ascending === 'boolean';
  if (!orientationRequested) return { ...bands, delta };

  // Side 1's perspective: positive means side 2 was the stronger side.
  const signed = signedRatingDelta({ ownRating: side1Rating, oppRating: side2Rating, ascending, scaleName });
  if (signed.error) return { competitive: 0, decisive: 0, routine: 0, error: signed.error, info: signed.info };

  const signedDelta = signed.signedDelta as number;
  const resolvedBands = deltaBands ?? resolveDeltaBands({ policyDefinitions, tournamentRecord });
  // No deltaBands in policy: the delta, and no band. Never a guessed default.
  if (!resolvedBands) return { ...bands, delta, signedDelta };

  const bandResult = resolveDeltaBand(signedDelta, resolvedBands, scaleName);
  if (bandResult.error) {
    return { competitive: 0, decisive: 0, routine: 0, error: bandResult.error, info: bandResult.info };
  }

  return { ...bands, delta, signedDelta, deltaBand: bandResult.band };
}
