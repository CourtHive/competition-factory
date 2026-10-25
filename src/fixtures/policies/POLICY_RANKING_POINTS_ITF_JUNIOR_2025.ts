/**
 * ITF World Tennis Tour Juniors — Ranking Points Policy, 2025
 *
 * Source: 2025 ITF World Tennis Tour Juniors Regulations, Regulations 10–14 (Combined Junior Ranking) and
 * Regulation 31 (Allocation of Points, points tables). Kept so 2025 results can be scored as they were awarded;
 * the current policy is POLICY_RANKING_POINTS_ITF_JUNIOR (2026), which adds a J60/J30 Round Robin to Elimination
 * table.
 *
 * The ITF Junior Finals row is NOT the 2025 Regulations' (published 13 December 2024: 850/600/480/420/370/320/280/
 * 240). The 2025 Finals awarded the winners 1000 points, "for the first time" (ITF, 2025 Finals media page and line-up
 * article), which is the 2026 table's value, so the 2026 row is used (CA, 2026-10-25). Only the winner's value is
 * confirmed for 2025; the 2025 Finals Special Regulations (published 28 March 2025) were not retrievable.
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
 *   - Only the best result from up to two editions of the same J100-or-higher tournament (Reg. 10), matched by
 *     Tournament.tournamentSeriesId; a tournament without one is unaffected
 *   - Ties: Grand Slam singles points, then singles points grade by grade from J500 down, then the same for doubles
 *     (Reg. 11), all within the counting results
 *   - No main draw points until a round is won; a bye is not a win, a walkover or retirement is (Reg. 31a)
 *   - Grand Slam qualifying: 30 for a qualifier who loses in the first round of the main draw, 20 for a loss in
 *     the final round of qualifying. The tables give no qualifying points at other grades.
 *
 * Not encoded:
 *   - International Team Competition points (per player-position win, best result only, best 8 teams)
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
// Two groups of four, then playoffs for every place: the semifinals and the 5th–8th classification
// (participationOrder 2), then the matches for 3rd and 7th (participationOrder 3). Places come from the playoffs.
const juniorFinalsSingles: AwardProfile = {
  profileName: 'ITF Junior Finals Singles',
  levels: [2],
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  eventTypes: [SINGLES],
  finishingPositionPoints: { participationOrders: [2, 3] },
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

// Reg. 10: only the best result from up to two editions of the same J100-or-higher tournament counts (Grand Slam
// and Youth Olympic Games, J500, J300, J200, J100). Editions are matched by Tournament.tournamentSeriesId.
const bestPerSeries = { levels: [1, 4, 5, 6, 7] };

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
      bestPerSeries,
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'],
      bestPerSeries,
      weight: 0.25,
    },
  ],

  // Reg. 11: Grand Slam singles points, then singles points grade by grade from J500 down; then the same for
  // doubles. The ITF Junior Finals are not a grade, so they are not in the countback.
  tiebreakCriteria: [
    { levelPoints: [1, 4, 5, 6, 7, 8, 9], eventTypes: [SINGLES] },
    { levelPoints: [1, 4, 5, 6, 7, 8, 9], eventTypes: [DOUBLES] },
  ],
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles: AwardProfile[] = [
  // Most specific first: drawType + level
  juniorFinalsSingles,

  // Grand Slams & Youth Olympic Games
  grandSlamSingles,
  grandSlamQualifyingSingles,
  grandSlamDoubles,

  // J500 through J30 (catch-all)
  standardSingles,
  standardDoubles,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_ITF_JUNIOR_2025 = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'ITF World Tennis Tour Juniors 2025',
    // 2025.02, not 2025.01: 2025.01 shipped tables that were not the ITF's (×100 scale, singles values below the
    // winner too high, doubles near a quarter of the ITF's), and a stored 2025.01 must not be mistaken for this one.
    policyVersion: '2025.02',
    pointsAuthority: ITF_JUNIOR,
    validDateRange: { startDate: '2025-01-01', endDate: '2025-12-31' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_ITF_JUNIOR_2025;
