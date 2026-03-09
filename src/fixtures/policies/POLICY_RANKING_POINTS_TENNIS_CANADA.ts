/**
 * Tennis Canada — Junior National Rankings Points Policy
 *
 * Source: Tennis Alberta Junior Competitive Structure (October 2025),
 *         Tennis Canada website, National Bank Rankings system
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1: National Championships (Junior Nationals — Indoor & Outdoor)
 *   Level 2: National Selection Events (Provincial 4-Star equivalent)
 *   Level 3: Provincial Championships (5-Star)
 *   Level 4: Provincial Development (3.5-Star / 3-Star)
 *   Level 5: Provincial Entry (2-Star)
 *
 * Key rules:
 *   - Rolling 52-week period, updated weekly
 *   - Players must win a match to receive points
 *   - Age groups: U12, U14, U16, U18 (separate rankings per gender/age)
 *   - Points identical across all age groups
 *   - Play-up allowed (U12→U16 max, U14→U18 max)
 *
 * NOTE: The exact national junior points table is managed at
 * nationalbankrankings.com. The values below use the 60% scaling ratio
 * confirmed by Tennis Alberta's documentation (which states it uses
 * "the same scaling system as Tennis Canada's National Rankings Points Table").
 * Base values are estimated from the competitive structure hierarchy.
 * Verify against official Tennis Canada documentation when available.
 */

import { CONSOLATION, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// ─── Singles Main Draw Profiles ──────────────────────────────────────────────

const standardSingles = {
  profileName: 'Standard Singles',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 1: 1500, 2: 600, 3: 1000, 4: 300, 5: 150 } }, // W
    2: { level: { 1: 900, 2: 360, 3: 600, 4: 180, 5: 90 } }, // F
    4: { level: { 1: 540, 2: 216, 3: 360, 4: 108, 5: 54 } }, // SF
    8: { level: { 1: 324, 2: 130, 3: 216, 4: 65, 5: 32 } }, // QF
    16: { level: { 1: 194, 2: 78, 3: 130, 4: 39, 5: 19 } }, // R16
    32: { level: { 1: 117, 2: 66, 3: 78, 4: 23, 5: 12 } }, // R32
    64: { level: { 1: 70, 2: 51, 3: 47, 4: 14, 5: 7 } }, // R64
  },
};

// ─── Singles Qualifying Profile ──────────────────────────────────────────────

// Qualifying draws at National Championships and National Selection Events
const qualifyingSingles = {
  profileName: 'Qualifying Singles',
  levels: [1, 2, 3],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 1: 117, 2: 47, 3: 78 } }, // Qualifier
    2: { level: { 1: 70, 2: 28, 3: 47 } }, // Final qualifying loss
    4: { level: { 1: 42, 2: 17, 3: 28 } }, // Qualifying SF loss
  },
};

// ─── Singles Consolation Profile ─────────────────────────────────────────────

// First-match consolation draws used at National Pathway events
const consolationSingles = {
  profileName: 'Consolation Singles',
  levels: [1, 2, 3],
  eventTypes: [SINGLES],
  stages: [CONSOLATION],
  finishingPositionRanges: {
    1: { level: { 1: 194, 2: 78, 3: 130 } }, // Consolation W
    2: { level: { 1: 117, 2: 47, 3: 78 } }, // Consolation F
    4: { level: { 1: 70, 2: 28, 3: 47 } }, // Consolation SF
  },
};

// ─── Doubles Main Draw Profile ───────────────────────────────────────────────

const standardDoubles = {
  profileName: 'Standard Doubles',
  levels: [1, 2, 3, 4, 5],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 1: 1500, 2: 600, 3: 1000, 4: 300, 5: 150 } },
    2: { level: { 1: 900, 2: 360, 3: 600, 4: 180, 5: 90 } },
    4: { level: { 1: 540, 2: 216, 3: 360, 4: 108, 5: 54 } },
    8: { level: { 1: 324, 2: 130, 3: 216, 4: 65, 5: 32 } },
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

const aggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: true,
  perCategory: true, // Separate rankings per age group (U12, U14, U16, U18)

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
    },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles = [standardSingles, qualifyingSingles, consolationSingles, standardDoubles];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_TENNIS_CANADA = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Tennis Canada Junior Rankings',
    policyVersion: '2025.01',
    validDateRange: { startDate: '2025-01-01' },

    awardProfiles,
    aggregationRules,

    requireWinForPoints: true, // Tennis Canada: "Players only receive points if they win a match"
    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_TENNIS_CANADA;
