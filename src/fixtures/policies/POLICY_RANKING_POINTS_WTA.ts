/**
 * PIF WTA Rankings — Complete Ranking Points Policy
 *
 * Source: https://www.wtatennis.com/rankings-explained (2026)
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1:  Grand Slams (2000 pts)
 *   Level 2:  WTA Finals (1500 pts — special RR + knockout)
 *   Level 3:  WTA 1000 (1000 pts, combined & non-combined)
 *   Level 4:  WTA 500 (500 pts)
 *   Level 5:  WTA 250 (250 pts)
 *   Level 6:  WTA 125 (125 pts)
 *   Level 7:  ITF W100 (100 pts)
 *   Level 8:  ITF W75 (75 pts)
 *   Level 9:  ITF W50 (50 pts)
 *   Level 10: ITF W35 (35 pts)
 *   Level 11: ITF W15 (15 pts)
 *
 * Key rules:
 *   - Rolling 52-week period (364 days)
 *   - Singles: max 18 tournaments (4 GS + best 6 combined WTA 1000 + best 1
 *     non-combined WTA 1000 + best 7 others) + WTA Finals as 19th
 *   - Doubles: best 12 results
 *   - Min 3 tournaments or 10 pts in 1 tournament to appear on rankings
 *   - Within-level draw size variations (96 vs 64/56 vs 32) handled by
 *     PositionValue array form with drawSize threshold conditions
 */

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { WTA } from '@Constants/pointsAuthorityConstants';

// ─── Singles Main Draw Profiles ──────────────────────────────────────────────

// ── Grand Slams (Level 1, 128-draw) ─────────────────────────────────────────
const grandSlamSingles = {
  profileName: 'Grand Slam Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 2000, // W
    2: 1300, // F
    4: 780, // SF
    8: 430, // QF
    16: 240, // R16
    32: 130, // R32
    64: 70, // R64
    128: 10, // R128
  },
};

// ── WTA Finals (Level 2) ────────────────────────────────────────────────────
// Actual scoring: 125 per RR match played + 160 per RR match won + knockout bonuses.
// The factory doesn't support "per match played" points, so we model this with
// approximate fixed position values representing typical outcomes.
//
// Approximate breakdown for undefeated champion (3 RR wins + SF + F):
//   RR: 3 × 125 (played) + 3 × 160 (won) = 855
//   Knockout: 1500 - 855 = 645
//
// These fixed values are approximations. Actual points vary by RR record.
const wtaFinalsSingles = {
  profileName: 'WTA Finals Singles',
  levels: [2],
  eventTypes: [SINGLES],
  finishingPositionRanges: {
    1: 1500, // Champion (max: 3 RR wins + SF + F)
    2: 1080, // Finalist (max: 3 RR wins + SF win + F loss)
    4: 750, // Semifinalist (max: 2 RR wins + SF loss)
    8: 375, // Group stage exit (approx: 3 matches played × 125)
  },
};

// ── WTA 1000 Singles (Level 3) ──────────────────────────────────────────────
// Draw sizes: 96 (combined: IW, Miami, Madrid, Rome, etc.) or 64/60/56
// All share W through R32; R64 and R128 differ by draw size.
const wta1000Singles = {
  profileName: 'WTA 1000 Singles',
  levels: [3],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 1000,
    2: 650,
    4: 390,
    8: 215,
    16: 120,
    32: 65,
    64: [
      { drawSize: 64, threshold: true, value: 35 }, // 96-draw: R64 = 35
      { value: 10 }, // 64/60/56-draw: R64 = 10 (first round)
    ],
    128: 10, // 96-draw only: R128 = 10
  },
};

// ── WTA 500 Singles (Level 4) ───────────────────────────────────────────────
// Draw sizes: 56 or 32
// R32 and R64 differ by draw size.
const wta500Singles = {
  profileName: 'WTA 500 Singles',
  levels: [4],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 500,
    2: 325,
    4: 195,
    8: 108,
    16: 60,
    32: [
      { drawSize: 48, threshold: true, value: 32 }, // 56-draw: R32 = 32
      { value: 1 }, // 32-draw: R32 = 1 (first round)
    ],
    64: 1, // 56-draw only: first round losers
  },
};

// ── WTA 250 Singles (Level 5, 32-draw) ──────────────────────────────────────
const wta250Singles = {
  profileName: 'WTA 250 Singles',
  levels: [5],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 250,
    2: 163,
    4: 98,
    8: 54,
    16: 30,
    32: 1, // R32 (first round)
  },
};

// ── WTA 125 Singles (Level 6, 32-draw) ──────────────────────────────────────
const wta125Singles = {
  profileName: 'WTA 125 Singles',
  levels: [6],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 125,
    2: 81,
    4: 49,
    8: 27,
    16: 15,
    32: 1, // R32 (first round)
  },
};

// ── ITF Circuit Singles (Levels 7-11) ───────────────────────────────────────
// Draw sizes: 48 or 32 (varies by event). W through QF are the same
// regardless of draw size. R16, R32, and R64 differ.
//
// R16 is higher for 32-draw events (deeper round relative to draw) and
// lower for 48-draw events. PositionValue array form with drawSize
// threshold handles this: drawSize >= 48 gets the 48M values, otherwise 32M.
//
// Point tables:
//   W100 (L7): W=100 F=65 SF=39 QF=21 R16=7/12 R32=1/1
//   W75  (L8): W=75  F=49 SF=29 QF=16 R16=5/9  R32=1/1
//   W50  (L9): W=50  F=33 SF=20 QF=11 R16=6/6  R32=3/1 R64=1/-
//   W35 (L10): W=35  F=23 SF=14 QF=8  R16=4/3  R32=2/- R64=1/-
//   W15 (L11): W=15  F=10 SF=6  QF=3  R16=1/-
//                                       (48M/32M)
const itfCircuitSingles = {
  profileName: 'ITF Circuit Singles',
  levels: [7, 8, 9, 10, 11],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 7: 100, 8: 75, 9: 50, 10: 35, 11: 15 } },
    2: { level: { 7: 65, 8: 49, 9: 33, 10: 23, 11: 10 } },
    4: { level: { 7: 39, 8: 29, 9: 20, 10: 14, 11: 6 } },
    8: { level: { 7: 21, 8: 16, 9: 11, 10: 8, 11: 3 } },
    // R16: differs by draw size for some levels
    16: [
      { drawSize: 48, threshold: true, level: { 7: 7, 8: 5, 9: 6, 10: 4, 11: 1 } },
      { level: { 7: 12, 8: 9, 9: 6, 10: 3, 11: 1 } }, // 32-draw default
    ],
    // R32: differs by draw size for W50 and W35
    32: [
      { drawSize: 48, threshold: true, level: { 7: 1, 8: 1, 9: 3, 10: 2 } },
      { level: { 7: 1, 8: 1, 9: 1 } }, // 32-draw default; W35/W15 = 0 (not listed)
    ],
    // R64: only 48-draw W50 and W35 have first-round losers at this depth
    64: { level: { 9: 1, 10: 1 } },
  },
};

// ─── Singles Qualifying Profile ──────────────────────────────────────────────

// ── Consolidated Qualifying Singles (Levels 1-10) ───────────────────────────
// Grand Slams have 3 qualifying rounds (position keys 1, 2, 4, 8).
// Most others have 2 rounds (position keys 1, 2, 4).
// Some ITF events have 1 round (position keys 1, 2).
// Level-keyed values handle all categories in a single profile.
//
// Position mapping:
//   1 = QLFR (qualifier — wins through qualifying to main draw)
//   2 = Final qualifying round loser (Q3 at Grand Slams, Q2 at 2-round events)
//   4 = Earlier qualifying round loser (Q2 at Grand Slams, Q1 at 2-round events)
//   8 = First round qualifying loser (Q1 at Grand Slams only)
const qualifyingSingles = {
  profileName: 'WTA Qualifying Singles',
  levels: [1, 3, 4, 5, 6, 7, 8, 9, 10],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 1: 40, 3: 30, 4: 25, 5: 18, 6: 6, 7: 5, 8: 3, 9: 2, 10: 1 } },
    2: { level: { 1: 30, 3: 20, 4: 13, 5: 12, 6: 4, 7: 3, 8: 2, 9: 1 } },
    4: { level: { 1: 20, 3: 2, 4: 1, 5: 1, 6: 1 } },
    8: { level: { 1: 2 } }, // Grand Slam Q1 only
  },
};

// ─── Doubles Main Draw Profiles ──────────────────────────────────────────────

// ── Grand Slam Doubles (Level 1, 64-draw) ───────────────────────────────────
const grandSlamDoubles = {
  profileName: 'Grand Slam Doubles',
  levels: [1],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 2000,
    2: 1300,
    4: 780,
    8: 430,
    16: 240,
    32: 130,
    64: 10, // R64 (first round doubles)
  },
};

// ── WTA Finals Doubles (Level 2) ────────────────────────────────────────────
// Fixed position-based values (no per-match-played complexity for doubles).
const wtaFinalsDoubles = {
  profileName: 'WTA Finals Doubles',
  levels: [2],
  eventTypes: [DOUBLES],
  finishingPositionRanges: {
    1: 1500,
    2: 1080,
    4: 750,
    8: 375,
  },
};

// ── WTA 1000 Doubles (Level 3, 28/32-draw) ─────────────────────────────────
const wta1000Doubles = {
  profileName: 'WTA 1000 Doubles',
  levels: [3],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 1000,
    2: 650,
    4: 390,
    8: 215,
    16: 120,
    32: 10, // R32 (first round)
  },
};

// ── WTA 500 Doubles (Level 4, 24/16-draw) ──────────────────────────────────
const wta500Doubles = {
  profileName: 'WTA 500 Doubles',
  levels: [4],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 500,
    2: 325,
    4: 195,
    8: 108,
    16: 1, // R16 (first round)
  },
};

// ── Standard Doubles: WTA 250 through ITF W35 (Levels 5-10, 16-draw) ───────
// All these levels use 16-draw doubles with R16 = 1 (first round).
const standardDoubles = {
  profileName: 'WTA 250–ITF W35 Doubles',
  levels: [5, 6, 7, 8, 9, 10],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 5: 250, 6: 125, 7: 100, 8: 75, 9: 50, 10: 35 } },
    2: { level: { 5: 163, 6: 81, 7: 65, 8: 49, 9: 33, 10: 23 } },
    4: { level: { 5: 98, 6: 49, 7: 39, 8: 29, 9: 20, 10: 14 } },
    8: { level: { 5: 54, 6: 27, 7: 21, 8: 16, 9: 11, 10: 8 } },
    16: 1, // R16 (first round) = 1 for all levels
  },
};

// ── ITF W15 Doubles (Level 11, 16-draw) ─────────────────────────────────────
// No points for first-round loss (R16) at W15 doubles.
const itfW15Doubles = {
  profileName: 'ITF W15 Doubles',
  levels: [11],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 15,
    2: 10,
    4: 6,
    8: 3,
  },
};

// ─── Doubles Qualifying Profile ──────────────────────────────────────────────

// ── Grand Slam Doubles Qualifying (Level 1 only) ────────────────────────────
const grandSlamDoublesQualifying = {
  profileName: 'Grand Slam Doubles Qualifying',
  levels: [1],
  eventTypes: [DOUBLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: 40, // QLFR (doubles qualifier)
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

// WTA Singles and Doubles are independent ranking lists.
//
// Singles: max 18 tournaments counted:
//   - 4 Grand Slams (mandatory)
//   - Best 6 of 7 combined WTA 1000s (mandatory)
//   - Best 1 non-combined WTA 1000
//   - Next best 7 results from remaining events
//   - WTA Finals as additional 19th tournament
//
// Mandatory counting: Grand Slam results always count. Best 6 of the
// combined WTA 1000 results are mandatory via bestOfCount on the rule.
//
// Doubles: best 12 results from all eligible events.
//
// Minimum requirements: 3 tournaments or 10 pts in 1 tournament.
const aggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: false, // WTA is women's tour only
  perCategory: false,

  minCountableResults: 3,

  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 19, // 18 regular + WTA Finals
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] as const,
      mandatoryRules: [
        { ruleName: 'Grand Slams', levels: [1] },
        { ruleName: 'WTA 1000 Combined', levels: [3], bestOfCount: 6 },
      ],
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 12,
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] as const,
    },
  ],

  tiebreakCriteria: ['highestSingleResult', 'mostCountingResults'] as const,
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

/**
 * Award profiles ordered from most specific to least specific.
 *
 * Profile matching order:
 *   1. WTA Finals (specific level 2)
 *   2. Grand Slam main/qualifying/doubles (specific level 1)
 *   3. WTA 1000, 500 (specific levels + stages)
 *   4. WTA 250, 125 (specific levels)
 *   5. Qualifying (broad, level-keyed)
 *   6. ITF Circuit (broad, level-keyed)
 *   7. Standard Doubles (broad, level-keyed)
 */
const awardProfiles = [
  // WTA Finals (most specific: level 2)
  wtaFinalsSingles,
  wtaFinalsDoubles,

  // Grand Slams
  grandSlamSingles,
  grandSlamDoubles,
  grandSlamDoublesQualifying,

  // WTA 1000
  wta1000Singles,
  wta1000Doubles,

  // WTA 500
  wta500Singles,
  wta500Doubles,

  // WTA 250
  wta250Singles,

  // WTA 125
  wta125Singles,

  // Qualifying (consolidated, level-keyed)
  qualifyingSingles,

  // ITF Circuit Singles (level-keyed with drawSize conditions)
  itfCircuitSingles,

  // Standard Doubles (level-keyed, L5-10)
  standardDoubles,

  // ITF W15 Doubles (separate due to no R16 points)
  itfW15Doubles,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_WTA = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'PIF WTA Rankings 2026',
    policyVersion: '2026.01',
    pointsAuthority: WTA,
    validDateRange: { startDate: '2026-01-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_WTA;
