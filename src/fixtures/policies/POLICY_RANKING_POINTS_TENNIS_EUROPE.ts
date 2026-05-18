/**
 * Tennis Europe Junior Tour — 2026 Ranking Points Policy
 *
 * Authoritative sources:
 *   - 2026_Tennis_Europe_Junior_Tour_Regulations.pdf
 *     https://www.tennisireland.ie/wp-content/uploads/2026/03/2026_Tennis_Europe_Junior_Tour_Regulations.pdf
 *   - Mentat/planning/RANKING_LISTS_PIPELINE_TE2026_REGS.txt
 *     (offline extracted text, point tables at lines ~3395-3705)
 *   - 2026 Major Rule Changes
 *     https://www.supervisor.lv/wp-content/uploads/2025/12/2026-Major-rule-changes_Tennis-Europe-Junior-Tour.pdf
 *
 * Tournament Categories → factory levels:
 *   Level 1: European Championships (14&U & 16&U)
 *   Level 2: Super Category
 *   Level 3: Category 1
 *   Level 4: Category 2
 *   Level 5: Category 3
 *   Level 6: 12&U Category 1 starting points (separate AwardProfile)
 *   Level 7: 12&U Category 2 starting points (separate AwardProfile)
 *
 * Age scaling:
 *   - 14&U values are the base (100%).
 *   - 16&U values are 200% of base — encoded as separate AwardProfiles per
 *     category code rather than via a multiplier, so AggregationRules treat
 *     16&U → 14&U carry cleanly.
 *   - 12&U "starting points" are unpublished and only switched on at age
 *     transition; the per-Cat profiles ('TE 12 Cat 1 starting points',
 *     'TE 12 Cat 2 starting points') are referenced by emission-time
 *     re-rate rules (see RankingPolicy.startingPointsEmission — pending
 *     PR 0.4 design call).
 *
 * Cross-category rules (categoryAggregation):
 *   - 16&U → 14&U list: at most 2 of 6 singles results may come from 16&U events.
 *   - 14&U → 16&U list: 14&U-eligible players appear on both lists, with
 *     14&U results contributing fully to the 16&U list (no cap).
 *   - 12&U starting points → 14&U list: on age transition, starting-points
 *     awards count fully on the 14&U list. Sourced from the
 *     'STARTING_POINTS' categoryName (emission-time tag).
 *
 * Counting buckets:
 *   - Singles best-6, Doubles best-2 (Tennis Europe regs section 4 / appendix B).
 *
 * Rolling period: 365 days (52-week ranking).
 */

import { CONSOLATION, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// ─── 14&U Singles Main Draw (base = 100%) ────────────────────────────────────

// European Championships 14&U (Level 1)
const eurChps14U = {
  profileName: 'TE 14&U European Championships',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: 250,
    2: 180,
    4: 120,
    8: 80,
    16: 50,
    32: 30,
    64: 20,
    128: 10,
  },
};

// Super Category 14&U (Level 2)
const super14U = {
  profileName: 'TE 14&U Super',
  levels: [2],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: 180,
    2: 150,
    4: 100,
    8: 70,
    16: 40,
    32: 25,
    64: 15,
  },
};

// Category 1 14&U (Level 3)
const cat1_14U = {
  profileName: 'TE 14&U Category 1',
  levels: [3],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: 120,
    2: 100,
    4: 75,
    8: 50,
    16: 30,
    32: 20,
    64: 10,
  },
};

// Category 2 14&U (Level 4)
const cat2_14U = {
  profileName: 'TE 14&U Category 2',
  levels: [4],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: 80,
    2: 65,
    4: 50,
    8: 30,
    16: 20,
    32: 15,
  },
};

// Category 3 14&U (Level 5)
const cat3_14U = {
  profileName: 'TE 14&U Category 3',
  levels: [5],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: 60,
    2: 50,
    4: 30,
    8: 20,
    16: 15,
    32: 10,
  },
};

// ─── 16&U Singles Main Draw (200% of base) ───────────────────────────────────

const eurChps16U = {
  profileName: 'TE 16&U European Championships',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: 500,
    2: 360,
    4: 240,
    8: 160,
    16: 100,
    32: 60,
    64: 40,
    128: 20,
  },
};

const super16U = {
  profileName: 'TE 16&U Super',
  levels: [2],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: 360,
    2: 300,
    4: 200,
    8: 140,
    16: 80,
    32: 50,
    64: 30,
  },
};

const cat1_16U = {
  profileName: 'TE 16&U Category 1',
  levels: [3],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: 240,
    2: 200,
    4: 150,
    8: 100,
    16: 60,
    32: 40,
    64: 20,
  },
};

const cat2_16U = {
  profileName: 'TE 16&U Category 2',
  levels: [4],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: 160,
    2: 130,
    4: 100,
    8: 60,
    16: 40,
    32: 30,
  },
};

const cat3_16U = {
  profileName: 'TE 16&U Category 3',
  levels: [5],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: 120,
    2: 100,
    4: 60,
    8: 40,
    16: 30,
    32: 20,
  },
};

// ─── Qualifying Singles ──────────────────────────────────────────────────────

const qualifying14U = {
  profileName: 'TE 14&U Qualifying',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: { level: { 1: 0, 2: 10, 3: 7, 4: 4, 5: 2 } }, // Qualifier
    2: { level: { 1: 0, 2: 7, 3: 5 } }, // Qualifying finalist
  },
};

const qualifying16U = {
  profileName: 'TE 16&U Qualifying',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: { level: { 1: 0, 2: 20, 3: 14, 4: 8, 5: 4 } },
    2: { level: { 1: 0, 2: 14, 3: 10 } },
  },
};

// ─── Bonus Draw (Consolation) Singles ────────────────────────────────────────

const bonus14U = {
  profileName: 'TE 14&U Bonus Draw',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [CONSOLATION],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: { level: { 1: 20, 2: 15, 3: 10, 4: 6, 5: 3 } },
    2: { level: { 1: 16, 2: 10, 3: 5, 4: 4, 5: 2 } },
    4: { level: { 1: 10, 2: 9, 3: 4, 4: 0, 5: 0 } },
    8: { level: { 1: 7, 2: 5, 3: 3, 4: 0, 5: 0 } },
  },
};

const bonus16U = {
  profileName: 'TE 16&U Bonus Draw',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [CONSOLATION],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: { level: { 1: 40, 2: 30, 3: 20, 4: 12, 5: 6 } },
    2: { level: { 1: 32, 2: 20, 3: 10, 4: 8, 5: 4 } },
    4: { level: { 1: 20, 2: 18, 3: 8, 4: 0, 5: 0 } },
    8: { level: { 1: 14, 2: 10, 3: 6, 4: 0, 5: 0 } },
  },
};

// ─── Doubles ────────────────────────────────────────────────────────────────

const doubles14U = {
  profileName: 'TE 14&U Doubles',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['14U'] },
  finishingPositionRanges: {
    1: { level: { 1: 65, 2: 50, 3: 30, 4: 20, 5: 15 } },
    2: { level: { 1: 45, 2: 30, 3: 25, 4: 15, 5: 10 } },
    4: { level: { 1: 30, 2: 25, 3: 20, 4: 10, 5: 5 } },
    8: { level: { 1: 15, 2: 12, 3: 10, 4: 5, 5: 2 } },
    16: { level: { 1: 10, 2: 7, 3: 5, 4: 0, 5: 0 } },
  },
};

const doubles16U = {
  profileName: 'TE 16&U Doubles',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['16U'] },
  finishingPositionRanges: {
    1: { level: { 1: 130, 2: 100, 3: 60, 4: 40, 5: 30 } },
    2: { level: { 1: 90, 2: 60, 3: 50, 4: 30, 5: 20 } },
    4: { level: { 1: 60, 2: 50, 3: 40, 4: 20, 5: 10 } },
    8: { level: { 1: 30, 2: 24, 3: 20, 4: 10, 5: 4 } },
    16: { level: { 1: 20, 2: 14, 3: 10, 4: 0, 5: 0 } },
  },
};

// ─── 12&U Starting Points (unpublished; switched on at age transition) ───────

// 12&U Cat 1 starting points — used at the 14&U scale via emission-time rerate.
// Profile name is what the categoryAggregation rule and any future
// startingPointsEmission rule reference (`profileName: 'TE 12 Cat 1 starting points'`).
const te12Cat1Starting = {
  profileName: 'TE 12 Cat 1 starting points',
  levels: [6],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['12U'] },
  finishingPositionRanges: {
    1: 25, // Winner
    2: 15, // Runner-up
    4: 10, // Semifinalist
    8: 6, // Quarterfinalist
  },
};

const te12Cat2Starting = {
  profileName: 'TE 12 Cat 2 starting points',
  levels: [7],
  eventTypes: [SINGLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['12U'] },
  finishingPositionRanges: {
    1: 15, // Winner
    2: 9, // Runner-up
    4: 5, // Semifinalist
    8: 3, // Quarterfinalist
  },
};

// 12&U Cat 1 qualifying / bonus / doubles — also for starting-points use
const te12Cat1Qualifying = {
  profileName: 'TE 12 Cat 1 starting points - Qualifying',
  levels: [6],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  category: { ageCategoryCodes: ['12U'] },
  finishingPositionRanges: { 1: 4 }, // Qualifier
};

const te12Cat2Qualifying = {
  profileName: 'TE 12 Cat 2 starting points - Qualifying',
  levels: [7],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  category: { ageCategoryCodes: ['12U'] },
  finishingPositionRanges: { 1: 2 },
};

const te12Cat1Doubles = {
  profileName: 'TE 12 Cat 1 starting points - Doubles',
  levels: [6],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['12U'] },
  finishingPositionRanges: { 1: 11, 2: 7 },
};

const te12Cat2Doubles = {
  profileName: 'TE 12 Cat 2 starting points - Doubles',
  levels: [7],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  category: { ageCategoryCodes: ['12U'] },
  finishingPositionRanges: { 1: 5, 2: 3 },
};

// ─── Aggregation Rules ──────────────────────────────────────────────────────

// Singles best-6, Doubles best-2, 52-week window.
// Cross-category contribution rules per TE 2026 regulations (p. 80):
//   "The six best Singles results, two of these may be from 14&Under events,
//    and the two best Doubles results from either 12 or 14 & Under events..."
const aggregationRules = {
  rollingPeriodDays: 365,
  separateByGender: true,
  perCategory: true,

  countingBuckets: [
    {
      bucketName: 'singles',
      eventTypes: [SINGLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'] as const,
    },
    {
      bucketName: 'doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 2,
      pointComponents: ['positionPoints'] as const,
    },
  ],

  categoryAggregation: [
    // 14&U list: at most 2 of 6 singles results may come from 16&U events.
    {
      ruleName: '16&U → 14&U list (cap 2 of 6 singles)',
      source: { ageCategoryCodes: ['16U'] },
      target: { ageCategoryCodes: ['14U'] },
      multiplier: 1.0,
      maxCarriedResults: 2,
      subjectToBucketLimits: true,
    },

    // 16&U list is wider: 14&U-eligible players appear on both lists,
    // and 14&U results count fully on the 16&U list (no cap).
    {
      ruleName: '14&U → 16&U list (no cap; appears on both)',
      source: { ageCategoryCodes: ['14U'] },
      target: { ageCategoryCodes: ['16U'] },
      multiplier: 1.0,
    },

    // 12&U starting points carry into 14&U list once "switched on" at the
    // entry deadline of the first tournament of the year the player turns 13.
    // The starting-points awards themselves are tagged at emission time with
    // categoryName 'STARTING_POINTS' (12&U scale) — see startingPointsEmission
    // design call in PR 0.4.
    {
      ruleName: '12&U starting points → 14&U (on age transition)',
      source: { ageCategoryCodes: ['12U'], categoryNames: ['STARTING_POINTS'] },
      target: { ageCategoryCodes: ['14U'] },
      multiplier: 1.0,
    },
  ],
};

// ─── Assembled Policy ───────────────────────────────────────────────────────

const awardProfiles = [
  // 16&U (most specific via category match)
  eurChps16U,
  super16U,
  cat1_16U,
  cat2_16U,
  cat3_16U,

  // 14&U
  eurChps14U,
  super14U,
  cat1_14U,
  cat2_14U,
  cat3_14U,

  // Qualifying
  qualifying16U,
  qualifying14U,

  // Bonus Draw
  bonus16U,
  bonus14U,

  // Doubles
  doubles16U,
  doubles14U,

  // 12&U starting-points profiles (referenced by emission-time rerate)
  te12Cat1Starting,
  te12Cat2Starting,
  te12Cat1Qualifying,
  te12Cat2Qualifying,
  te12Cat1Doubles,
  te12Cat2Doubles,
];

// ─── Export ─────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_TENNIS_EUROPE = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Tennis Europe Junior Tour 2026',
    policyVersion: '2026.01',
    validDateRange: { startDate: '2026-01-01' },

    pointPoolModel: 'per-category' as const,

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_TENNIS_EUROPE;
