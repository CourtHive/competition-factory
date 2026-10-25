/**
 * ITF World Tennis Tour Juniors — Ranking Points Policy, 2026
 *
 * Source: 2026 ITF World Tennis Tour Juniors Regulations, Regulations 10–14 (Combined Junior Ranking) and
 * Regulation 31 (Allocation of Points, points tables). The 2025 tables are kept in
 * POLICY_RANKING_POINTS_ITF_JUNIOR_2025; they differ only in the ITF Junior Finals row, and 2025 has no
 * Round Robin to Elimination table.
 *
 * Tournament Levels (mapped to factory levels):
 *   Level 1: Grand Slam & Youth Olympic Games
 *   Level 2: ITF World Tennis Tour Junior Finals (8 players, places 1–8)
 *   Level 3: not used (earlier versions put the European Championships here: a Tennis Europe event, not an ITF grade)
 *   Level 4: J500
 *   Level 5: J300
 *   Level 6: J200
 *   Level 7: J100
 *   Level 8: J60
 *   Level 9: J30
 *
 * Key rules:
 *   - Combined ranking: the six best singles results plus one quarter of the six best doubles results (Reg. 10),
 *     encoded as the Doubles bucket's `weight: 0.25`
 *   - Rolling 52-week period (Reg. 13)
 *   - No main draw points until a round is won; a bye is not a win, a walkover or retirement is (Reg. 31a)
 *   - Grand Slam qualifying: 30 for a qualifier who loses in the first round of the main draw, 20 for a loss in
 *     the final round of qualifying. The tables give no qualifying points at other grades.
 *
 * Not encoded:
 *   - The tiebreak countback by Grand Slam, then grade-by-grade points (Reg. 11)
 *   - Counting only the better of two editions of the same J100-or-higher tournament (Reg. 10)
 *   - International Team Competition points (per player-position win, best result only, best 8 teams)
 *   - ITF Junior Finals 3rd and 7th: the engine reads a place from the first playoff round only, so the 3rd/4th
 *     and 7th/8th place matches are not read and both players score as 4th (and 8th)
 *   - J60/J30 Round Robin to Elimination: the playoff places (QF onward) are encoded; the round robin places
 *     (2nd: 5/2 points, 3rd–4th: 2/1 with a match won) are not, because the engine does not report a
 *     participant's place within a round robin group
 */

import { MAIN, QUALIFYING, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import type { AggregationRules, AwardProfile } from '@Types/rankingTypes';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { ITF_JUNIOR } from '@Constants/pointsAuthorityConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// ─── Singles ─────────────────────────────────────────────────────────────────

// ── Grand Slam & Youth Olympic Games (Level 1) ──────────────────────────────
const grandSlamSingles: AwardProfile = {
  profileName: 'Grand Slam Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [MAIN],
  requireWinForPoints: true,
  finishingPositionRanges: {
    1: 1000, // W
    2: 700, // F
    4: 490, // SF
    8: 300, // QF
    16: 180, // R16
    32: 90, // R32
  },
};

// ── Grand Slam Qualifying (Level 1) ─────────────────────────────────────────
// A qualifier's 30 stands only when they lose their first main draw match: the main draw award replaces it
// whenever it is larger, which every main draw result after a win is.
const grandSlamQualifyingSingles: AwardProfile = {
  profileName: 'Grand Slam Qualifying Singles',
  levels: [1],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: 30, // Qualifier
    2: 20, // Final round of qualifying
  },
};

// ── ITF World Tennis Tour Junior Finals (Level 2, places 1–8) ──────────────
// Two groups of four, then playoffs for every place. Points are read from the playoffs (participationOrder 2): a
// round robin group does not report a place.
const juniorFinalsSingles: AwardProfile = {
  profileName: 'ITF Junior Finals Singles',
  levels: [2],
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  eventTypes: [SINGLES],
  finishingPositionPoints: { participationOrders: [2] },
  finishingPositionRanges: {
    1: 1000,
    2: 700,
    3: 550,
    4: 490,
    5: 420,
    6: 360,
    7: 320,
    8: 260,
  },
};

// ── J500 through J30 (Levels 4–9) ───────────────────────────────────────────
// J60 and J30 award nothing in R32.
const standardSingles: AwardProfile = {
  profileName: 'Standard Singles',
  levels: [4, 5, 6, 7, 8, 9],
  eventTypes: [SINGLES],
  stages: [MAIN],
  requireWinForPoints: true,
  finishingPositionRanges: {
    1: { level: { 4: 500, 5: 300, 6: 200, 7: 100, 8: 60, 9: 30 } },
    2: { level: { 4: 350, 5: 210, 6: 140, 7: 60, 8: 36, 9: 18 } },
    4: { level: { 4: 250, 5: 140, 6: 100, 7: 36, 8: 18, 9: 9 } },
    8: { level: { 4: 150, 5: 100, 6: 60, 7: 20, 8: 10, 9: 5 } },
    16: { level: { 4: 90, 5: 60, 6: 36, 7: 10, 8: 5, 9: 2 } },
    32: { level: { 4: 45, 5: 30, 6: 18, 7: 5 } },
  },
};

// ── J60 and J30 Round Robin to Elimination (Levels 8–9) ─────────────────────
// Group winners play off from the quarterfinals; only the playoff (participationOrder 2) is encoded here.
const roundRobinToEliminationSingles: AwardProfile = {
  profileName: 'Round Robin to Elimination Singles',
  levels: [8, 9],
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  eventTypes: [SINGLES],
  // No requireWinForPoints: it counts playoff wins only, and a group winner has already won a match (Reg. 31a ii)
  finishingPositionPoints: { participationOrders: [2] },
  finishingPositionRanges: {
    1: { level: { 8: 60, 9: 30 } },
    2: { level: { 8: 36, 9: 18 } },
    4: { level: { 8: 18, 9: 9 } },
    8: { level: { 8: 10, 9: 5 } },
  },
};

// ─── Doubles ─────────────────────────────────────────────────────────────────
// Points as the table gives them; the combined ranking counts a quarter of them (the Doubles bucket's weight).

// ── Grand Slam & Youth Olympic Games (Level 1) ──────────────────────────────
const grandSlamDoubles: AwardProfile = {
  profileName: 'Grand Slam Doubles',
  levels: [1],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  requireWinForPoints: true,
  finishingPositionRanges: {
    1: 750, // W
    2: 525, // F
    4: 367, // SF
    8: 225, // QF
    16: 135, // R16
  },
};

// ── J500 through J30 (Levels 4–9) ───────────────────────────────────────────
// J60 and J30 award nothing in R16.
const standardDoubles: AwardProfile = {
  profileName: 'Standard Doubles',
  levels: [4, 5, 6, 7, 8, 9],
  eventTypes: [DOUBLES],
  stages: [MAIN],
  requireWinForPoints: true,
  finishingPositionRanges: {
    1: { level: { 4: 375, 5: 225, 6: 150, 7: 75, 8: 45, 9: 25 } },
    2: { level: { 4: 262, 5: 157, 6: 105, 7: 45, 8: 27, 9: 13 } },
    4: { level: { 4: 187, 5: 105, 6: 75, 7: 27, 8: 14, 9: 6 } },
    8: { level: { 4: 112, 5: 75, 6: 45, 7: 15, 8: 7, 9: 3 } },
    16: { level: { 4: 67, 5: 45, 6: 27, 7: 7 } },
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

const aggregationRules: AggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: true,
  perCategory: false,

  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'],
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'],
      weight: 0.25,
    },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles: AwardProfile[] = [
  // Most specific first: drawType + level
  juniorFinalsSingles,
  roundRobinToEliminationSingles,

  // Grand Slams & Youth Olympic Games
  grandSlamSingles,
  grandSlamQualifyingSingles,
  grandSlamDoubles,

  // J500 through J30 (catch-all)
  standardSingles,
  standardDoubles,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_ITF_JUNIOR = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'ITF World Tennis Tour Juniors 2026',
    policyVersion: '2026.01',
    pointsAuthority: ITF_JUNIOR,
    validDateRange: { startDate: '2026-01-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_ITF_JUNIOR;
