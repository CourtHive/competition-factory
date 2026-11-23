// Pure logistic-fit utilities for the competitive-bands predictor.
// Two anchor points (delta, probability) → fitted logistic curve.

export type PredictionAnchor = {
  probability: number;
  delta: number;
};

export type PredictionModel = {
  competitiveAnchors: PredictionAnchor[];
  decisiveAnchors: PredictionAnchor[];
};

export type BandPrediction = {
  competitive: number;
  decisive: number;
  routine: number;
};

type LogisticParams = { k: number; x0: number };

const EPSILON = 1e-9;

function logit(probability: number): number {
  const clamped = Math.min(1 - EPSILON, Math.max(EPSILON, probability));
  return Math.log(clamped / (1 - clamped));
}

// Fits a decreasing logistic P(d) = 1 / (1 + exp(k*(d - x0))) — k > 0
// when probability decreases as delta grows (the COMPETITIVE shape).
export function fitDecreasingLogistic(a: PredictionAnchor, b: PredictionAnchor): LogisticParams {
  const numerator = logit(a.probability) - logit(b.probability);
  const denominator = b.delta - a.delta;
  const k = denominator === 0 ? 0 : numerator / denominator;
  const x0 = k === 0 ? a.delta : a.delta + logit(a.probability) / k;
  return { k, x0 };
}

export function evaluateDecreasingLogistic({ k, x0 }: LogisticParams, delta: number): number {
  if (k === 0) return 0.5;
  return 1 / (1 + Math.exp(k * (delta - x0)));
}

// Returns probabilities {competitive, decisive, routine} summing to 1.
// Routine is computed as the residual after clamping competitive +
// decisive to [0, 1]; this keeps the output a valid distribution
// even when policy anchors are aggressive.
export function predictBandsFromDelta(delta: number, model: PredictionModel): BandPrediction {
  const [c1, c2] = model.competitiveAnchors;
  const [d1, d2] = model.decisiveAnchors;
  if (!c1 || !c2 || !d1 || !d2) {
    return { competitive: 0, decisive: 0, routine: 1 };
  }
  const competitiveCurve = fitDecreasingLogistic(c1, c2);
  const competitive = evaluateDecreasingLogistic(competitiveCurve, delta);

  // For an INCREASING decisive curve, fit on (1 - probability).
  const decisiveCurve = fitDecreasingLogistic(
    { delta: d1.delta, probability: 1 - d1.probability },
    { delta: d2.delta, probability: 1 - d2.probability },
  );
  const decisive = 1 - evaluateDecreasingLogistic(decisiveCurve, delta);

  const cClamped = Math.min(1, Math.max(0, competitive));
  const dClamped = Math.min(1, Math.max(0, decisive));
  const remainder = 1 - cClamped - dClamped;
  const routine = Math.max(0, remainder);

  // If competitive + decisive > 1 (extreme policy), renormalize the
  // pair so the distribution still sums to 1 with routine = 0.
  if (remainder < 0) {
    const total = cClamped + dClamped;
    return {
      competitive: cClamped / total,
      decisive: dClamped / total,
      routine: 0,
    };
  }

  return { competitive: cClamped, decisive: dClamped, routine };
}
