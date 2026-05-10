import {
  predictBandsFromDelta,
  fitDecreasingLogistic,
  evaluateDecreasingLogistic,
} from '@Query/matchUp/competitiveBandsPrediction';
import { predictMatchUpCompetitiveBands } from '@Query/matchUp/predictMatchUpCompetitiveBands';
import { expect, it, describe } from 'vitest';

// constants and types
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

// Fixtures
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';

const DEFAULT_MODEL = POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].predictionModel;

describe('logistic curve fitting', () => {
  it('passes through both anchors for the COMPETITIVE curve', () => {
    const [a, b] = DEFAULT_MODEL.competitiveAnchors;
    const curve = fitDecreasingLogistic(a, b);

    expect(evaluateDecreasingLogistic(curve, a.delta)).toBeCloseTo(a.probability, 6);
    expect(evaluateDecreasingLogistic(curve, b.delta)).toBeCloseTo(b.probability, 6);
  });

  it('produces strictly decreasing P(competitive) as delta grows', () => {
    const [a, b] = DEFAULT_MODEL.competitiveAnchors;
    const curve = fitDecreasingLogistic(a, b);
    const probs = [0, 0.5, 1, 1.5, 2.5].map((d) => evaluateDecreasingLogistic(curve, d));

    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeLessThan(probs[i - 1]);
    }
  });
});

describe('predictBandsFromDelta — band distribution', () => {
  it('Fish 0.5 anchor lands ~55% competitive at delta=0.5 (default policy)', () => {
    const bands = predictBandsFromDelta(0.5, DEFAULT_MODEL);
    expect(bands.competitive).toBeGreaterThan(0.5);
    expect(bands.competitive).toBeLessThan(0.6);
  });

  it('all probabilities sum to ~1', () => {
    for (const delta of [0, 0.5, 1, 1.5, 2, 3]) {
      const { competitive, decisive, routine } = predictBandsFromDelta(delta, DEFAULT_MODEL);
      expect(competitive + decisive + routine).toBeCloseTo(1, 5);
    }
  });

  it('tight rating band → high competitive %, low decisive %', () => {
    const tight = predictBandsFromDelta(0.05, DEFAULT_MODEL);
    expect(tight.competitive).toBeGreaterThan(0.6);
    expect(tight.decisive).toBeLessThan(0.2);
  });

  it('wide rating band → high decisive %, low competitive %', () => {
    const wide = predictBandsFromDelta(2.5, DEFAULT_MODEL);
    expect(wide.decisive).toBeGreaterThan(0.6);
    expect(wide.competitive).toBeLessThan(0.2);
  });

  it('competitive % is monotonically non-increasing in delta', () => {
    const competitiveSeries = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3].map(
      (d) => predictBandsFromDelta(d, DEFAULT_MODEL).competitive,
    );
    for (let i = 1; i < competitiveSeries.length; i++) {
      expect(competitiveSeries[i]).toBeLessThanOrEqual(competitiveSeries[i - 1]);
    }
  });

  it('decisive % is monotonically non-decreasing in delta', () => {
    const decisiveSeries = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3].map(
      (d) => predictBandsFromDelta(d, DEFAULT_MODEL).decisive,
    );
    for (let i = 1; i < decisiveSeries.length; i++) {
      expect(decisiveSeries[i]).toBeGreaterThanOrEqual(decisiveSeries[i - 1]);
    }
  });
});

describe('predictMatchUpCompetitiveBands — public API', () => {
  it('returns INVALID_VALUES when ratings are missing', () => {
    const result = predictMatchUpCompetitiveBands({ side1Rating: 4 });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns delta as |r1 - r2| (order-independent)', () => {
    const a = predictMatchUpCompetitiveBands({ side1Rating: 4.5, side2Rating: 5 });
    const b = predictMatchUpCompetitiveBands({ side1Rating: 5, side2Rating: 4.5 });

    expect(a.delta).toBeCloseTo(0.5, 6);
    expect(b.delta).toBeCloseTo(0.5, 6);
    expect(a.competitive).toBeCloseTo(b.competitive ?? 0, 6);
  });

  it('falls back to default policy when no model or tournamentRecord supplied', () => {
    const result = predictMatchUpCompetitiveBands({ side1Rating: 4.5, side2Rating: 4.5 });
    expect(result.competitive).toBeGreaterThan(0.65);
    expect(result.competitive).toBeLessThan(0.75);
  });

  it('explicit predictionModel overrides default', () => {
    const aggressivelyDecisive = {
      competitiveAnchors: [
        { delta: 0, probability: 0.3 },
        { delta: 1.5, probability: 0.05 },
      ],
      decisiveAnchors: [
        { delta: 0, probability: 0.5 },
        { delta: 1.5, probability: 0.85 },
      ],
    };

    const matched = predictMatchUpCompetitiveBands({
      predictionModel: aggressivelyDecisive,
      side1Rating: 4,
      side2Rating: 4,
    });

    const defaultMatched = predictMatchUpCompetitiveBands({
      side1Rating: 4,
      side2Rating: 4,
    });

    expect(matched.competitive).toBeLessThan(defaultMatched.competitive);
    expect(matched.decisive).toBeGreaterThan(defaultMatched.decisive);
  });
});
