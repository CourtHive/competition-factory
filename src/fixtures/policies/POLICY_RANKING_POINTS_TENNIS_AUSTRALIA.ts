/**
 * Tennis Australia — De Minaur Junior Tour Ranking Points Policy
 *
 * Source: Tennis Australia Junior Tour pages (2025-2026 season)
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1: J1000 (1000 points to winner)
 *   Level 2: J500  (500 points to winner)
 *   Level 3: J250  (250 points to winner)
 *   Level 4: J125  (125 points to winner)
 *
 * Key rules:
 *   - Best 8 results in singles and doubles count toward Points Race total
 *   - Maximum 3 results from events outside player's age category
 *   - Age groups: 12U, 14U (De Minaur Junior Tour), 16U (Australian Junior Tour)
 *   - Entry/seeding based on UTR Rating
 *   - Points Race qualification period runs ~12 months (October to October)
 *
 * Round-by-round scaling: 60% per round, matching the standard scaling used
 * across Australian provincial and national systems.
 */

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

// ─── Singles Main Draw Profiles ──────────────────────────────────────────────

const standardSingles = {
  profileName: 'Standard Singles',
  levels: [1, 2, 3, 4],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 1: 1000, 2: 500, 3: 250, 4: 125 } }, // W
    2: { level: { 1: 600, 2: 300, 3: 150, 4: 75 } }, // F
    4: { level: { 1: 360, 2: 180, 3: 90, 4: 45 } }, // SF
    8: { level: { 1: 216, 2: 108, 3: 54, 4: 27 } }, // QF
    16: { level: { 1: 130, 2: 65, 3: 32, 4: 16 } }, // R16
    32: { level: { 1: 78, 2: 39, 3: 19, 4: 10 } }, // R32
  },
};

// ─── Doubles Main Draw Profiles ──────────────────────────────────────────────

const standardDoubles = {
  profileName: 'Standard Doubles',
  levels: [1, 2, 3, 4],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 1: 1000, 2: 500, 3: 250, 4: 125 } },
    2: { level: { 1: 600, 2: 300, 3: 150, 4: 75 } },
    4: { level: { 1: 360, 2: 180, 3: 90, 4: 45 } },
    8: { level: { 1: 216, 2: 108, 3: 54, 4: 27 } },
    16: { level: { 1: 130, 2: 65, 3: 32, 4: 16 } },
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

const aggregationRules = {
  rollingPeriodDays: 364, // ~12 months (October to October qualification period)
  separateByGender: true,
  perCategory: true, // Separate rankings per age group (12U, 14U, 16U)

  countingBuckets: [
    {
      bucketName: 'Singles & Doubles',
      bestOfCount: 8,
      pointComponents: ['positionPoints'] as const,
    },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles = [standardSingles, standardDoubles];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_TENNIS_AUSTRALIA = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Tennis Australia Junior Tour',
    policyVersion: '2025.01',
    validDateRange: { startDate: '2025-10-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_TENNIS_AUSTRALIA;
