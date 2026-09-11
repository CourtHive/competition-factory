/**
 * PIF ATP Rankings — Complete Ranking Points Policy
 *
 * Source: atp-2026-points-table.pdf (2026 season)
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1:  Grand Slams (2000 pts)
 *   Level 2:  ATP Finals (1500 pts — per-win RR + playoff)
 *   Level 3:  ATP 1000, 96-draw
 *   Level 4:  ATP 1000, 48/56-draw
 *   Level 5:  ATP Tour 500, 48-draw
 *   Level 6:  ATP Tour 500, 32-draw
 *   Level 7:  ATP Tour 250, 48-draw
 *   Level 8:  ATP Tour 250, 32-draw
 *   Level 9:  Challenger 175
 *   Level 10: Challenger 125
 *   Level 11: Challenger 100
 *   Level 12: Challenger 75
 *   Level 13: Challenger 50
 *   Level 14: ITF M 25/25+H
 *   Level 15: ITF M 15/15+H
 *
 * Key rules:
 *   - Rolling 52-week period (364 days)
 *   - Singles: ~19 best tournaments (4 GS + 8 ATP 1000 mandatory + best 7 others)
 *   - Doubles: best 18 results
 *   - Singles and doubles are independent ranking lists
 *   - Players qualifying through qualifying receive Q bonus in addition to main draw points
 *   - Wild cards at GS and ATP 1000 receive points only from 2nd round onward
 *   - No points for first-round loss at ATP 500, 250, Challengers, ITF events
 */

import { MAIN, QUALIFYING, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { SINGLES, DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { ATP } from '@Constants/pointsAuthorityConstants';

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
    4: 800, // SF
    8: 400, // QF
    16: 200, // R16
    32: 100, // R32
    64: 50, // R64
    128: 10, // R128
  },
};

// ── ATP Finals (Level 2, Round Robin with Playoff) ──────────────────────────
// Scoring: 200 per RR match win + 400 for SF win + 500 for Final win
// Undefeated champion = 3×200 + 400 + 500 = 1500
//
// Modeled as: perWinPoints for RR stage (participationOrder 1) +
// finishingPositionRanges for playoff (participationOrder 2).
// Playoff position values represent cumulative playoff round win bonuses:
//   Champion: 400 (SF) + 500 (F) = 900
//   Finalist: 400 (SF) = 400
//   SF losers: 0
const atpFinalsSingles = {
  profileName: 'ATP Finals Singles',
  levels: [2],
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  eventTypes: [SINGLES],
  finishingPositionPoints: { participationOrders: [2] },
  finishingPositionRanges: {
    1: 900, // Champion playoff bonus (SF win 400 + F win 500)
    2: 400, // Finalist playoff bonus (SF win 400)
    4: 0, // SF losers
  },
  perWinPoints: {
    participationOrders: [1],
    value: 200, // 200 per round-robin match win
  },
};

// ── ATP 1000 Singles (Levels 3-4) ───────────────────────────────────────────
// L3 = 96-draw: R64=30, R128=10
// L4 = 48/56-draw: R64=10, no R128
const atp1000Singles = {
  profileName: 'ATP 1000 Singles',
  levels: [3, 4],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 1000,
    2: 650,
    4: 400,
    8: 200,
    16: 100,
    32: 50,
    64: { level: { 3: 30, 4: 10 } },
    128: { level: { 3: 10 } }, // only L3 (96-draw) has R128
  },
};

// ── ATP Tour 500 Singles (Levels 5-6) ───────────────────────────────────────
// L5 = 48-draw: R32=25
// L6 = 32-draw: no R32 points (first-round loss = 0)
const atp500Singles = {
  profileName: 'ATP 500 Singles',
  levels: [5, 6],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 500,
    2: 330,
    4: 200,
    8: 100,
    16: 50,
    32: { level: { 5: 25 } }, // L5 only; L6 = no first-round points
  },
};

// ── ATP Tour 250 Singles (Levels 7-8) ───────────────────────────────────────
// L7 = 48-draw: R32=13
// L8 = 32-draw: no R32 points (first-round loss = 0)
const atp250Singles = {
  profileName: 'ATP 250 Singles',
  levels: [7, 8],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 250,
    2: 165,
    4: 100,
    8: 50,
    16: 25,
    32: { level: { 7: 13 } }, // L7 only; L8 = no first-round points
  },
};

// ── Challenger & ITF Singles (Levels 9-15, 32-draw) ─────────────────────────
// No points for first-round loss (R32) at any of these levels.
const challengerItfSingles = {
  profileName: 'Challenger & ITF Singles',
  levels: [9, 10, 11, 12, 13, 14, 15],
  eventTypes: [SINGLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 9: 175, 10: 125, 11: 100, 12: 75, 13: 50, 14: 25, 15: 15 } },
    2: { level: { 9: 90, 10: 64, 11: 50, 12: 44, 13: 25, 14: 14, 15: 8 } },
    4: { level: { 9: 50, 10: 35, 11: 25, 12: 22, 13: 14, 14: 7, 15: 4 } },
    8: { level: { 9: 25, 10: 16, 11: 14, 12: 12, 13: 8, 14: 3, 15: 2 } },
    16: { level: { 9: 13, 10: 8, 11: 7, 12: 6, 13: 4, 14: 1, 15: 1 } },
  },
};

// ─── Singles Qualifying Profiles ─────────────────────────────────────────────

// ── Grand Slam Qualifying (Level 1, 128-player qualifying, 3 rounds) ────────
// Q = qualifier wins through = 30 pts bonus (added to main draw points)
// Q3 = final round qualifying loss = 16 pts
// Q2 = second round qualifying loss = 8 pts
// Q1 = first round qualifying loss = 0 pts
const grandSlamQualifyingSingles = {
  profileName: 'Grand Slam Qualifying Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: 30, // Q (qualifier bonus)
    2: 16, // Q3 (final/3rd round loss)
    4: 8, // Q2 (2nd round loss)
  },
};

// ── Standard Qualifying Singles (Levels 3-13, 2 rounds) ─────────────────────
// Position 1 = qualifier bonus, Position 2 = final round qualifying loss
// Note: Qualifying points vary by tournament category AND draw size.
// L3 (ATP 1000 96-draw): Q=20, FRQ=10
// L4 (ATP 1000 48/56-draw): Q=30, FRQ=16
// L5 (ATP 500 48-draw): Q=16, FRQ=8
// L6 (ATP 500 32-draw): Q=25, FRQ=13
// L7 (ATP 250 48-draw): Q=8, FRQ=4
// L8 (ATP 250 32-draw): Q=13, FRQ=7
// L9-13 (Challengers): see level-keyed values
// L14-15 (ITF): no ATP qualifying points (ITF qualifying handled by ITF policy)
const standardQualifyingSingles = {
  profileName: 'Qualifying Singles',
  levels: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 3: 20, 4: 30, 5: 16, 6: 25, 7: 8, 8: 13, 9: 6, 10: 5, 11: 4, 12: 4, 13: 3 } },
    2: { level: { 3: 10, 4: 16, 5: 8, 6: 13, 7: 4, 8: 7, 9: 3, 10: 3, 11: 2, 12: 2, 13: 1 } },
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
    1: 2000, // W
    2: 1200, // F
    4: 720, // SF
    8: 360, // QF
    16: 180, // R16
    32: 90, // R32
  },
};

// ── ATP Finals Doubles (Level 2, Round Robin with Playoff) ──────────────────
// Same scoring structure as singles: 200/RR win, 400 SF, 500 F
const atpFinalsDoubles = {
  profileName: 'ATP Finals Doubles',
  levels: [2],
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  eventTypes: [DOUBLES],
  finishingPositionPoints: { participationOrders: [2] },
  finishingPositionRanges: {
    1: 900,
    2: 400,
    4: 0,
  },
  perWinPoints: {
    participationOrders: [1],
    value: 200,
  },
};

// ── ATP 1000 Doubles (Levels 3-4, 24-32 draw) ──────────────────────────────
// Same points for both 32-draw and 24/28-draw ATP 1000 doubles
const atp1000Doubles = {
  profileName: 'ATP 1000 Doubles',
  levels: [3, 4],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 1000,
    2: 600,
    4: 360,
    8: 180,
    16: 90,
  },
};

// ── ATP Tour 500 Doubles (Levels 5-6, 16-draw) ─────────────────────────────
const atp500Doubles = {
  profileName: 'ATP 500 Doubles',
  levels: [5, 6],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 500,
    2: 300,
    4: 180,
    8: 90,
  },
};

// ── ATP 250 Doubles (Levels 7-8) ────────────────────────────────────────────
// L7 = 24-draw: has R16=20
// L8 = 16-draw: no R16 points
const atp250Doubles = {
  profileName: 'ATP 250 Doubles',
  levels: [7, 8],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: 250,
    2: 150,
    4: 90,
    8: 45,
    16: { level: { 7: 20 } }, // L7 (24-draw) only
  },
};

// ── Challenger & ITF Doubles (Levels 9-15) ──────────────────────────────────
const challengerItfDoubles = {
  profileName: 'Challenger & ITF Doubles',
  levels: [9, 10, 11, 12, 13, 14, 15],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  finishingPositionRanges: {
    1: { level: { 9: 175, 10: 125, 11: 100, 12: 75, 13: 50, 14: 25, 15: 15 } },
    2: { level: { 9: 100, 10: 75, 11: 60, 12: 50, 13: 30, 14: 14, 15: 8 } },
    4: { level: { 9: 60, 10: 45, 11: 36, 12: 30, 13: 17, 14: 7, 15: 4 } },
    8: { level: { 9: 32, 10: 25, 11: 20, 12: 16, 13: 9, 14: 3, 15: 2 } },
  },
};

// ─── Team Event ──────────────────────────────────────────────────────────────

// ── United Cup (Team Event) ─────────────────────────────────────────────────
// United Cup awards 500 ATP ranking points to the winning team's players.
// Full details in ATP Rulebook Section 4.03 G (not available in this source).
// For now, modeled as a simplified team event.
const unitedCup = {
  profileName: 'United Cup',
  eventTypes: [TEAM_EVENT],
  finishingPositionRanges: {
    1: 500, // Winning team
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

// ATP Singles and Doubles are independent ranking lists.
// Singles: best 19 results (4 Grand Slams + 8 ATP 1000 mandatory + best 7 others)
// Doubles: best 18 results
//
// Mandatory counting: Grand Slam and ATP 1000 results always count even if
// they are worse than optional results. If a player doesn't play a mandatory
// event, a zero-point placeholder effectively counts toward their 19 tournaments.
const aggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: false, // ATP is men's tour only
  perCategory: false,

  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 19,
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] as const,
      mandatoryRules: [
        { ruleName: 'Grand Slams', levels: [1] },
        { ruleName: 'ATP 1000', levels: [3, 4] },
      ],
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 18,
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] as const,
    },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

/**
 * Award profiles ordered from most specific to least specific.
 *
 * Profile matching order:
 *   1. ATP Finals (specific drawType + level)
 *   2. Grand Slam main/qualifying (specific level + stage)
 *   3. ATP 1000, 500, 250 main draw (specific levels + stage)
 *   4. Standard qualifying (broad levels + QUALIFYING stage)
 *   5. Challenger & ITF main draw (broad levels, catch-all)
 *   6. United Cup (team event catch-all)
 */
const awardProfiles = [
  // ATP Finals (most specific: drawType + level)
  atpFinalsSingles,
  atpFinalsDoubles,

  // Grand Slams
  grandSlamSingles,
  grandSlamQualifyingSingles,
  grandSlamDoubles,

  // ATP 1000
  atp1000Singles,
  atp1000Doubles,

  // ATP 500
  atp500Singles,
  atp500Doubles,

  // ATP 250
  atp250Singles,
  atp250Doubles,

  // Qualifying (broad catch-all for L3-13)
  standardQualifyingSingles,

  // Challengers & ITF (broad catch-all)
  challengerItfSingles,
  challengerItfDoubles,

  // Team events
  unitedCup,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_ATP = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'PIF ATP Rankings 2026',
    policyVersion: '2026.01',
    pointsAuthority: ATP,
    validDateRange: { startDate: '2026-01-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_ATP;
