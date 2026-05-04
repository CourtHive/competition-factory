import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';

import { DECISIVE, ROUTINE } from '@Constants/statsConstants';

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
