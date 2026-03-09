/**
 * Tennis Europe Junior Tour — Complete Ranking Points Policy
 *
 * Source: Tennis Ireland adaptation of ITF/Tennis Europe official points tables
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1: TE 14&16 Super Category (= Grade A / J500 points)
 *   Level 2: TE 14&16 Super Category (= J200 points)
 *   Level 3: TE 14&16 Category 1 (= J100 points)
 *   Level 4: TE 14&16 Category 2 (= J60 points)
 *   Level 5: TE 14&16 Category 3 / TE 12 Category 1 (= J30 points)
 *   Level 6: TE 12 Category 2 (= J30 points, same scale)
 *
 * Key rules:
 *   - Best 6 singles + best 6 doubles results count (doubles weighted ×0.25)
 *   - Rolling 52-week period
 *   - Bonus Draw (consolation) points available at some levels
 *   - Qualifying points (per round won) at Levels 1-5
 */

import { CONSOLATION, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// ─── Singles Main Draw Profiles ──────────────────────────────────────────────

// ── TE 14&16 Super (Level 1, = Grade A / J500 points) ───────────────────────
const superASingles = {
  profileName: 'TE Super (Grade A)',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 50000, // W
    2: 40000, // F
    4: 30000, // SF
    8: 20000, // QF
    16: 10000, // R16
    32: 5000, // R32
  },
};

// ── TE 14&16 Super (Level 2, = J200 points) ─────────────────────────────────
const superBSingles = {
  profileName: 'TE Super (J200)',
  levels: [2],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 20000, // W
    2: 16000, // F
    4: 12000, // SF
    8: 8000, // QF
    16: 4000, // R16
    32: 2000, // R32
  },
};

// ── TE 14&16 Category 1 (Level 3, = J100 points) ───────────────────────────
const cat1Singles = {
  profileName: 'TE Category 1',
  levels: [3],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 10000, // W
    2: 8000, // F
    4: 6000, // SF
    8: 4000, // QF
    16: 2000, // R16
    32: 1000, // R32
  },
};

// ── TE 14&16 Category 2 (Level 4, = J60 points) ────────────────────────────
const cat2Singles = {
  profileName: 'TE Category 2',
  levels: [4],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 6000, // W
    2: 4800, // F
    4: 3600, // SF
    8: 2400, // QF
    16: 1200, // R16
    32: 600, // R32
  },
};

// ── TE 14&16 Category 3 / TE 12 Category 1 (Level 5, = J30 points) ─────────
const cat3Singles = {
  profileName: 'TE Category 3',
  levels: [5],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 3000, // W
    2: 2400, // F
    4: 1800, // SF
    8: 1200, // QF
    16: 600, // R16
    32: 300, // R32
  },
};

// ── TE 12 Category 2 (Level 6, = J30 points) ───────────────────────────────
const cat3BSingles = {
  profileName: 'TE 12 Category 2',
  levels: [6],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 3000, // W
    2: 2400, // F
    4: 1800, // SF
    8: 1200, // QF
    16: 600, // R16
    32: 300, // R32
  },
};

// ─── Singles Qualifying Profiles ─────────────────────────────────────────────

const qualifyingSingles = {
  profileName: 'Qualifying Singles',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 1: 2000, 2: 650, 3: 350, 4: 250, 5: 175 } },
    2: { level: { 1: 1000, 2: 400, 3: 250, 4: 175, 5: 100 } },
  },
};

// ─── Singles Bonus Draw (Consolation) Profiles ──────────────────────────────

const bonusDrawSingles = {
  profileName: 'Bonus Draw Singles',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [CONSOLATION],
  finishingPositionRanges: {
    1: { level: { 1: 2000, 2: 650, 3: 350, 4: 250, 5: 175 } },
    2: { level: { 1: 1000, 2: 400, 3: 250, 4: 175, 5: 100 } },
  },
};

// ─── Doubles Profiles ────────────────────────────────────────────────────────

const standardDoubles = {
  profileName: 'Standard Doubles',
  levels: [1, 2, 3, 4, 5, 6],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 1: 9500, 2: 3750, 3: 1875, 4: 1125, 5: 600, 6: 600 } },
    2: { level: { 1: 7600, 2: 3000, 3: 1500, 4: 900, 5: 480, 6: 480 } },
    4: { level: { 1: 5700, 2: 2250, 3: 1125, 4: 675, 5: 360, 6: 360 } },
    8: { level: { 1: 3800, 2: 1500, 3: 750, 4: 450, 5: 240, 6: 240 } },
    16: { level: { 1: 1900, 2: 750, 3: 375, 4: 225, 5: 120, 6: 120 } },
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

const aggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: true,
  perCategory: false,

  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'] as const,
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'] as const,
      weight: 0.25,
    },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles = [
  // Singles main draw (most specific first)
  superASingles,
  superBSingles,
  cat1Singles,
  cat2Singles,
  cat3Singles,
  cat3BSingles,

  // Qualifying
  qualifyingSingles,

  // Bonus draw (consolation)
  bonusDrawSingles,

  // Doubles
  standardDoubles,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_TENNIS_EUROPE = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Tennis Europe Junior Tour',
    policyVersion: '2025.01',
    validDateRange: { startDate: '2025-01-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_TENNIS_EUROPE;
