import { ANCHOR, DECISIVE, DOWN, EVEN, ROUTINE, STRETCH, UP } from '@Constants/statsConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';

// Default prediction-model anchors are calibrated from Dave Fish's
// "Need For a Rating System" (2011) data: ~25% competitive ratio at
// USTA sectional age-group depth, ~55% at WTA-Slam / ITA-Women's
// depth, ~70% at ATP-Slam / ITA-Men's depth. The fitted logistic
// passes through (delta=0, P=0.70) and (delta=1.5, P=0.25) for the
// COMPETITIVE band, with delta in rating units (UTR-equivalent).
export const POLICY_COMPETITIVE_BANDS_DEFAULT = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: {
    policyName: 'Competitive Bands Default',
    profileBands: {
      [DECISIVE]: 20,
      [ROUTINE]: 50,
    },
    // SIGNED EXPOSURE axis — a second, orthogonal axis, NOT a widening of
    // `profileBands`. An ordered boundary list: N entries produce N bands and
    // the final entry omits its bound to catch the remainder. A boundary is
    // `max` (absolute rating units) XOR `maxPct` (percent of the scale's
    // range); declaring both is a validation error.
    //
    // `maxPct` is the portable form, which is why the shipped default uses it:
    // one policy behaves sensibly across WTN / UTR / NTRP / ELO, whose ranges
    // differ by orders of magnitude.
    //
    // This default is SYMMETRIC as a convenience, not as a claim. Playing up
    // two levels and playing down two levels are unlikely to be
    // developmentally equivalent, and the ordered list expresses asymmetry
    // freely (+2 / -4) — but we have no evidence supporting any particular
    // asymmetry, and shipping an invented one would put an unevidenced
    // developmental judgement into everyone's numbers. Asymmetry is a
    // federation policy choice.
    //
    // 10.3% of the WTN range (39 points) is ~±4 WTN, the cut used in the ITA
    // college corpus analysis. It sat near the 90th percentile of observed
    // |delta| there — an explicitly arbitrary cut, restated so it is not
    // mistaken for a finding.
    deltaBands: [
      { key: ANCHOR, maxPct: -10.3 },
      { key: DOWN, maxPct: -1.3 },
      { key: EVEN, maxPct: 1.3 },
      { key: UP, maxPct: 10.3 },
      { key: STRETCH },
    ],
    predictionModel: {
      competitiveAnchors: [
        { delta: 0, probability: 0.7 },
        { delta: 1.5, probability: 0.25 },
      ],
      decisiveAnchors: [
        { delta: 0, probability: 0.1 },
        { delta: 1.5, probability: 0.55 },
      ],
    },
  },
};

export default POLICY_COMPETITIVE_BANDS_DEFAULT;
