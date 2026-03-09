/**
 * ITF World Tennis Tour Juniors — Complete Ranking Points Policy
 *
 * Source: ITF Junior Circuit official points table (via Tennis Ireland adaptation)
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1: Grand Slam & Youth Olympics (128-draw)
 *   Level 2: Junior Masters (round-robin, 8 players)
 *   Level 3: European Championships
 *   Level 4: Grade A / J500
 *   Level 5: J300
 *   Level 6: J200
 *   Level 7: J100
 *   Level 8: J60
 *   Level 9: J30
 *
 * Key rules:
 *   - Best 6 singles + best 6 doubles results count (doubles weighted ×0.25)
 *   - Rolling 52-week period
 *   - Singles and doubles are separate ranking components
 *   - Qualifying points (per round won) awarded at Levels 1, 4-9
 */

import { MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// ─── Singles Main Draw Profiles ──────────────────────────────────────────────

// ── Grand Slam & Youth Olympics (Level 1, 128-draw) ─────────────────────────
const grandSlamSingles = {
  profileName: 'Grand Slam Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 100000, // W
    2: 70000, // F
    4: 49000, // SF
    8: 30000, // QF
    16: 18000, // R16
    32: 9000, // R32
  },
};

// ── Junior Masters (Level 2, Round Robin, 8 players) ────────────────────────
// Positions 1st through 8th based on final RR standings
const mastersSingles = {
  profileName: 'Junior Masters Singles',
  levels: [2],
  drawTypes: [ROUND_ROBIN],
  eventTypes: [SINGLES],
  finishingPositionRanges: {
    1: 75000, // 1st
    2: 45000, // 2nd
    3: 32000, // 3rd
    4: 25000, // 4th
    5: 20000, // 5th
    6: 18500, // 6th
    7: 16500, // 7th
    8: 15000, // 8th
  },
};

// ── European Championships (Level 3) ────────────────────────────────────────
const europeanChampSingles = {
  profileName: 'European Championships Singles',
  levels: [3],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 75000, // W
    2: 55000, // F
    4: 39500, // SF
    8: 25000, // QF
    16: 14000, // R16
    32: 7000, // R32
  },
};

// ── Grade A through J30 (Levels 4-9) ────────────────────────────────────────
const standardSingles = {
  profileName: 'Standard Singles',
  levels: [4, 5, 6, 7, 8, 9],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 4: 50000, 5: 30000, 6: 20000, 7: 10000, 8: 6000, 9: 3000 } },
    2: { level: { 4: 40000, 5: 24000, 6: 16000, 7: 8000, 8: 4800, 9: 2400 } },
    4: { level: { 4: 30000, 5: 18000, 6: 12000, 7: 6000, 8: 3600, 9: 1800 } },
    8: { level: { 4: 20000, 5: 12000, 6: 8000, 7: 4000, 8: 2400, 9: 1200 } },
    16: { level: { 4: 10000, 5: 6000, 6: 4000, 7: 2000, 8: 1200, 9: 600 } },
    32: { level: { 4: 5000, 5: 3000, 6: 2000, 7: 1000, 8: 600, 9: 300 } },
  },
};

// ─── Singles Qualifying Profiles ─────────────────────────────────────────────

// ── Grand Slam Qualifying (Level 1, 2 rounds) ──────────────────────────────
const grandSlamQualifyingSingles = {
  profileName: 'Grand Slam Qualifying Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: 3000, // Qualifier (2nd match won)
    2: 2000, // Final qualifying round loss (1st match won)
  },
};

// ── Standard Qualifying (Levels 4-9, 2 rounds) ─────────────────────────────
const standardQualifyingSingles = {
  profileName: 'Qualifying Singles',
  levels: [4, 5, 6, 7, 8, 9],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 4: 2000, 5: 1250, 6: 650, 7: 350, 8: 250, 9: 175 } },
    2: { level: { 4: 1000, 5: 700, 6: 400, 7: 250, 8: 175, 9: 100 } },
  },
};

// ─── Doubles Profiles ────────────────────────────────────────────────────────

// ── Grand Slam Doubles (Level 1) ────────────────────────────────────────────
const grandSlamDoubles = {
  profileName: 'Grand Slam Doubles',
  levels: [1],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 19000, // W
    2: 15200, // F
    4: 11400, // SF
    8: 7600, // QF
    16: 3800, // R16
  },
};

// ── European Championships Doubles (Level 3) ────────────────────────────────
const europeanChampDoubles = {
  profileName: 'European Championships Doubles',
  levels: [3],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 14000, // W
    2: 11200, // F
    4: 8400, // SF
    8: 5600, // QF
    16: 2800, // R16
  },
};

// ── Grade A through J30 Doubles (Levels 4-9) ────────────────────────────────
const standardDoubles = {
  profileName: 'Standard Doubles',
  levels: [4, 5, 6, 7, 8, 9],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 4: 9500, 5: 5700, 6: 3750, 7: 1875, 8: 1125, 9: 600 } },
    2: { level: { 4: 7600, 5: 4600, 6: 3000, 7: 1500, 8: 900, 9: 480 } },
    4: { level: { 4: 5700, 5: 3400, 6: 2250, 7: 1125, 8: 675, 9: 360 } },
    8: { level: { 4: 3800, 5: 2250, 6: 1500, 7: 750, 8: 450, 9: 240 } },
    16: { level: { 4: 1900, 5: 1150, 6: 750, 7: 375, 8: 225, 9: 120 } },
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
  // Masters (most specific: drawType + level)
  mastersSingles,

  // Grand Slams
  grandSlamSingles,
  grandSlamQualifyingSingles,
  grandSlamDoubles,

  // European Championships
  europeanChampSingles,
  europeanChampDoubles,

  // Standard qualifying (L4-9)
  standardQualifyingSingles,

  // Standard main draw (L4-9, catch-all)
  standardSingles,
  standardDoubles,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_ITF_JUNIOR = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'ITF World Tennis Tour Juniors',
    policyVersion: '2025.01',
    validDateRange: { startDate: '2025-01-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_ITF_JUNIOR;
