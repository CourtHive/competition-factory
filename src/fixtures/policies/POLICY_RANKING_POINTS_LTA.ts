/**
 * LTA (Lawn Tennis Association) Rankings — Complete Ranking Points Policy
 *
 * Source: LTA Rankings – Individual Points Table (Open), April 2020
 *         LTA Rankings – Team Points Table (Open), April 2020
 *         LTA Support Centre — Rankings FAQ pages
 *
 * Tournament Grades (mapped to factory levels):
 *   Level 1: British Tour – Premier (Grade 1 with enhanced top positions)
 *   Level 2: Grade 1
 *   Level 3: Grade 2
 *   Level 4: Grade 3
 *   Level 5: Grade 4
 *   Level 6: Grade 5
 *
 * Key rules:
 *   - Best 6 singles + 25% of best 6 doubles results count
 *   - Rolling 52-week period (12 months)
 *   - Age groups: 11U, 12U, 14U, 16U, 18U, Open (same points across all)
 *   - 9U & 10U use separate "Recent Form" system (best 3 from 6 months)
 *   - Minimum 5 players for singles, 3 teams for doubles to award points
 *   - Qualifying and consolation stage positions receive points
 *   - Team events award per-win points by player line position
 */

import { CONSOLATION, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SINGLES, DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';

// ─── Singles Main Draw Profiles ──────────────────────────────────────────────

// ── British Tour – Premier (Level 1) ─────────────────────────────────────────
// Grade 1 with enhanced W/F/SF: W=6000, RU=4500, SF=3300
const premierSingles = {
  profileName: 'British Tour Premier Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 6000, // W (enhanced)
    2: 4500, // F (enhanced)
    4: 3300, // SF (enhanced)
    8: 1600, // QF (Grade 1 value)
    16: 1200, // R16
    32: 800, // R32
    64: 400, // R64
  },
};

// ── Standard Singles (Grades 1-5, Levels 2-6) ────────────────────────────────
const standardSingles = {
  profileName: 'Standard Singles',
  levels: [2, 3, 4, 5, 6],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 2: 4000, 3: 3000, 4: 1000, 5: 500, 6: 300 } },
    2: { level: { 2: 3000, 3: 2260, 4: 760, 5: 380, 6: 240 } },
    4: { level: { 2: 2200, 3: 1660, 4: 560, 5: 280, 6: 180 } },
    8: { level: { 2: 1600, 3: 1200, 4: 400, 5: 200, 6: 120 } },
    16: { level: { 2: 1200, 3: 900, 4: 300, 5: 152, 6: 88 } },
    32: { level: { 2: 800, 3: 600, 4: 200, 5: 100, 6: 72 } },
    64: { level: { 2: 400, 3: 300, 4: 100, 5: 48, 6: 20 } },
  },
};

// ─── Singles Qualifying Profiles ─────────────────────────────────────────────

// Qualifying positions mapped from the LTA unified position table.
// Qualifier (won qualifying) aligns with main-draw 5th position equivalent.
// Qualifying final-round loss aligns with main-draw QF equivalent.
const qualifyingSingles = {
  profileName: 'Qualifying Singles',
  levels: [2, 3, 4, 5, 6],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 2: 740, 3: 560, 4: 184, 5: 96, 6: 68 } }, // Qualifier
    2: { level: { 2: 700, 3: 520, 4: 176, 5: 92, 6: 64 } }, // Qualifying RU
    4: { level: { 2: 660, 3: 500, 4: 164, 5: 84, 6: 56 } }, // Qualifying SF
    16: { level: { 2: 520, 3: 400, 4: 132, 5: 52, 6: 24 } }, // Qualifying R16
    32: { level: { 2: 400, 3: 300, 4: 100, 5: 48, 6: 20 } }, // Qualifying R32
  },
};

// Premier qualifying uses Grade 1 values
const premierQualifyingSingles = {
  profileName: 'Premier Qualifying Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: 740, // Qualifier
    2: 700, // Qualifying RU
    4: 660, // Qualifying SF
    16: 520, // Qualifying R16
    32: 400, // Qualifying R32
  },
};

// ─── Singles Consolation Profile ─────────────────────────────────────────────

// Consolation draw positions from the LTA table.
// Consolation Winner aligns with main-draw R16 equivalent points.
const consolationSingles = {
  profileName: 'Consolation Singles',
  levels: [1, 2, 3, 4, 5, 6],
  eventTypes: [SINGLES],
  stages: [CONSOLATION],
  finishingPositionRanges: {
    1: { level: { 1: 1200, 2: 1200, 3: 900, 4: 300, 5: 152, 6: 88 } },
    2: { level: { 1: 1000, 2: 1000, 3: 760, 4: 252, 5: 124, 6: 80 } },
    4: { level: { 1: 800, 2: 800, 3: 600, 4: 200, 5: 100, 6: 72 } },
    8: { level: { 1: 660, 2: 660, 3: 500, 4: 164, 5: 84, 6: 56 } },
    16: { level: { 1: 520, 2: 520, 3: 400, 4: 132, 5: 52, 6: 24 } },
    32: { level: { 1: 400, 2: 400, 3: 300, 4: 100, 5: 48, 6: 20 } },
  },
};

// ─── Doubles Profiles ────────────────────────────────────────────────────────

// The LTA uses the same individual points table for doubles as singles.
// Combined ranking = best 6 singles + 25% of best 6 doubles.
const standardDoubles = {
  profileName: 'Standard Doubles',
  levels: [1, 2, 3, 4, 5, 6],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 1: 6000, 2: 4000, 3: 3000, 4: 1000, 5: 500, 6: 300 } },
    2: { level: { 1: 4500, 2: 3000, 3: 2260, 4: 760, 5: 380, 6: 240 } },
    4: { level: { 1: 3300, 2: 2200, 3: 1660, 4: 560, 5: 280, 6: 180 } },
    8: { level: { 1: 1600, 2: 1600, 3: 1200, 4: 400, 5: 200, 6: 120 } },
    16: { level: { 1: 1200, 2: 1200, 3: 900, 4: 300, 5: 152, 6: 88 } },
    32: { level: { 1: 800, 2: 800, 3: 600, 4: 200, 5: 100, 6: 72 } },
    64: { level: { 1: 400, 2: 400, 3: 300, 4: 100, 5: 48, 6: 20 } },
  },
};

// ─── Team Event Profiles ─────────────────────────────────────────────────────

// Team events award per-win points. Point values vary by opponent line position.
// The factory doesn't yet support per-line-position points, so we use the
// average of the top 3 line positions as a representative per-win value.
const teamSingles = {
  profileName: 'Team Singles',
  levels: [2, 3, 4, 5, 6],
  eventTypes: [TEAM_EVENT],
  perWinPoints: {
    level: { 2: 360, 3: 320, 4: 240, 5: 160, 6: 84 },
  },
};

// Team doubles: per-win points for doubles matches within team events
const teamDoubles = {
  profileName: 'Team Doubles',
  levels: [2, 3, 4, 5, 6],
  eventTypes: [TEAM_EVENT],
  perWinPoints: {
    level: { 2: 360, 3: 320, 4: 240, 5: 160, 6: 84 },
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

const aggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: true,
  perCategory: true, // Separate rankings per age group

  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints', 'perWinPoints'] as const,
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints', 'perWinPoints'] as const,
      weight: 0.25,
    },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles = [
  // Premier (most specific)
  premierSingles,
  premierQualifyingSingles,

  // Standard singles main draw
  standardSingles,

  // Qualifying
  qualifyingSingles,

  // Consolation
  consolationSingles,

  // Doubles
  standardDoubles,

  // Team events
  teamSingles,
  teamDoubles,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_LTA = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'LTA Rankings',
    policyVersion: '2020.04',
    validDateRange: { startDate: '2020-04-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_LTA;
