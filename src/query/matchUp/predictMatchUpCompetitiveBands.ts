import { predictBandsFromDelta, BandPrediction, PredictionModel } from './competitiveBandsPrediction';
import { findPolicy } from '@Acquire/findPolicy';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { Tournament } from '@Types/tournamentTypes';

// Fixtures
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';

type PredictMatchUpCompetitiveBandsArgs = {
  predictionModel?: PredictionModel;
  tournamentRecord?: Tournament;
  side1Rating?: number;
  side2Rating?: number;
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
export function predictMatchUpCompetitiveBands({
  tournamentRecord,
  predictionModel,
  side1Rating,
  side2Rating,
}: PredictMatchUpCompetitiveBandsArgs): BandPrediction & {
  delta?: number;
  error?: ErrorType;
} {
  if (typeof side1Rating !== 'number' || typeof side2Rating !== 'number') {
    return { competitive: 0, decisive: 0, routine: 0, error: INVALID_VALUES };
  }

  const model = resolvePredictionModel(predictionModel, tournamentRecord);
  const delta = Math.abs(side1Rating - side2Rating);
  const bands = predictBandsFromDelta(delta, model);

  return { ...bands, delta };
}
