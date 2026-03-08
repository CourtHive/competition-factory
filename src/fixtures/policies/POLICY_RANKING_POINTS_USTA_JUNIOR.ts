/**
 * USTA Junior Tournaments Ranking System — Complete Ranking Points Policy
 *
 * Source: jr-points-table-2025.pdf (Updated January 2025)
 * Covers all 8 pages of the PDF including:
 *   - Round Robin (page 2)
 *   - Round Robin with First Match Consolation Playoff (page 2)
 *   - Modified Feed In, Compass, First Match Consolation, Voluntary Consolation, Single Elimination (page 3)
 *   - Team Tournaments (page 4)
 *   - Feed-In Championship through Quarterfinals (page 5)
 *   - Feed-In Championship through Round of 16 + Quarterfinal Playoffs (page 6)
 *   - Curtis Consolation (page 7)
 *   - Flighted Level 4 Tournament (page 8)
 *   - Flighted Level 5 Tournament (page 8)
 *   - Bonus Points for Wins vs. Ranked Opponents (page 8)
 *
 * Tournament Levels:
 *   Level 1: National Championships
 *   Level 2: National-level
 *   Level 3-5: Section/regional
 *   Level 6-7: Intermediate (L7 only compass approved; L6 only compass and modified feed-in approved)
 *
 * Age Categories (12U, 14U, 16U, 18U):
 *   Point values are identical across all age categories.
 *   Separation by age and gender occurs at the ranking list (aggregation) level.
 *
 * NOTE: Profiles are ordered from most specific to least specific for correct
 * "first match wins" selection in the current getAwardProfile implementation.
 * When specificity scoring (plan Phase 1) is implemented, ordering becomes
 * a tiebreaker only.
 */

import {
  COMPASS,
  CONSOLATION,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  MAIN,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  PLAY_OFF,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  VOLUNTARY_CONSOLATION,
} from '@Constants/drawDefinitionConstants';
import { SINGLES, DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';

// ─── Award Profiles ──────────────────────────────────────────────────────────

// ── Page 2: Round Robin (Levels 3-5) ──────────────────────────────────────────
// Points per win. Max 5 matches at L3-5.
const roundRobinL3to5 = {
  profileName: 'Round Robin L3-5',
  drawTypes: [ROUND_ROBIN],
  levels: [3, 4, 5],
  perWinPoints: {
    level: { 3: 225, 4: 135, 5: 75 },
  },
  maxCountableMatches: 5,
};

// ── Page 2: Round Robin (Levels 6-7) ─────────────────────────────────────────
// Points per win + champion/finalist bonus. Max 4 matches at L6-7.
const roundRobinL6to7 = {
  profileName: 'Round Robin L6-7',
  drawTypes: [ROUND_ROBIN],
  levels: [6, 7],
  perWinPoints: {
    level: { 6: 20, 7: 12 },
  },
  maxCountableMatches: 4,
  bonusPoints: [
    { finishingPositions: [1], value: { level: { 6: 15, 7: 8 } } },
    { finishingPositions: [2], value: { level: { 6: 10, 7: 6 } } },
  ],
};

// ── Page 2: Round Robin with First Match Consolation Playoff (Levels 3-5) ─────
// Different per-win values by bracket. Max 4 matches at L6-7.
//
// In a ROUND_ROBIN_WITH_PLAYOFF, participants move through multiple structures:
//   participationOrder 1: Preliminary Round Robin groups
//   participationOrder 2: Playoff bracket (champion, 2nd place, 3rd place, or 4th place)
//   participationOrder 3+: Consolation within playoff bracket
//
// Bracket identification:
//   rankingStage MAIN → Champion Bracket Main Draw
//   rankingStage CONSOLATION → Champion Bracket Consolation
//   rankingStage PLAY_OFF → 2nd/3rd/4th Place Brackets
//
// NOTE: Current factory may not fully differentiate 2nd/3rd/4th place brackets.
// The perWinPoints for those brackets differ (41/25/14, 34/21/11, 27/16/9 at L3/4/5).
// TODO: Validate factory's stageSequence/structure assignment for RR playoff brackets
// and add additional profiles if needed. For now, lower brackets use 2nd-place values
// as a conservative approximation.

const rrWithPlayoffL3to5_PreliminaryRR = {
  profileName: 'RR Playoff L3-5: Preliminary RR',
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  levels: [3, 4, 5],
  participationOrder: 1,
  perWinPoints: {
    level: { 3: 71, 4: 43, 5: 24 },
  },
};

const rrWithPlayoffL3to5_ChampionMain = {
  profileName: 'RR Playoff L3-5: Champion Bracket Main Draw',
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  levels: [3, 4, 5],
  participationOrder: 2,
  stages: [MAIN],
  perWinPoints: {
    level: { 3: 229, 4: 137, 5: 76 },
  },
};

const rrWithPlayoffL3to5_ChampionConsolation = {
  profileName: 'RR Playoff L3-5: Champion Bracket Consolation',
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  levels: [3, 4, 5],
  participationOrder: 3,
  stages: [CONSOLATION],
  perWinPoints: {
    level: { 3: 71, 4: 43, 5: 24 },
  },
};

// TODO: These bracket profiles need factory validation for correct stage/stageSequence matching.
// In the USTA system, 2nd/3rd/4th place RR bracket matches have different per-win values:
//   2nd place: L3: 41, L4: 25, L5: 14
//   3rd place: L3: 34, L4: 21, L5: 11
//   4th place: L3: 27, L4: 16, L5: 9
// Until bracket differentiation is verified, using PLAY_OFF stage with 2nd-place values.
const rrWithPlayoffL3to5_PlacementBrackets = {
  profileName: 'RR Playoff L3-5: Placement Brackets (2nd/3rd/4th)',
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  levels: [3, 4, 5],
  stages: [PLAY_OFF],
  perWinPoints: {
    level: { 3: 41, 4: 25, 5: 14 },
  },
  // Per-bracket values for future implementation:
  // 2nd place bracket: { level: { 3: 41, 4: 25, 5: 14 } }
  // 3rd place bracket: { level: { 3: 34, 4: 21, 5: 11 } }
  // 4th place bracket: { level: { 3: 27, 4: 16, 5: 9 } }
};

// ── Page 2: Round Robin with First Match Consolation Playoff (Levels 6-7) ─────
// At L6-7 all brackets simplify: Main Draw 20/12, Consolation/Other 10/6
const rrWithPlayoffL6to7 = {
  profileName: 'RR Playoff L6-7',
  drawTypes: [ROUND_ROBIN_WITH_PLAYOFF],
  levels: [6, 7],
  perWinPoints: [
    { participationOrders: [1], level: { 6: 20, 7: 12 } },
    { participationOrders: [2], level: { 6: 20, 7: 12 } },
    { participationOrders: [3, 4, 5, 6], level: { 6: 10, 7: 6 } },
  ],
  maxCountableMatches: 4,
  bonusPoints: [
    { finishingPositions: [1], value: { level: { 6: 15, 7: 8 } } },
    { finishingPositions: [2], value: { level: { 6: 10, 7: 6 } } },
  ],
};

// ── Page 4: Team Tournaments (Levels 1-7) ─────────────────────────────────────
// Points per win by line position. Max 5 matches at L3-5, max 4 at L6-7.
const teamTournaments = {
  profileName: 'Team Tournaments',
  levels: [1, 2, 3, 4, 5, 6, 7],
  eventTypes: [TEAM_EVENT],
  perWinPoints: {
    level: {
      1: { line: [300, 275, 250, 225, 200, 175] },
      2: { line: [180, 156, 131, 108, 84, 59] },
      3: { line: [156, 133, 109, 86, 62, 51], limit: 5 },
      4: { line: [105, 91, 78, 65, 53, 39], limit: 5 },
      5: { line: [57, 49, 42, 35, 29, 21], limit: 4 },
      6: { line: [24, 21, 18, 15, 12, 10], limit: 4 },
      7: { line: [14, 12, 10, 9, 7, 6], limit: 4 },
    },
  },
  maxCountableMatches: { level: { 3: 5, 4: 5, 5: 5, 6: 4, 7: 4 } },
};

// ── Page 8: Flighted Level 4 Tournament ───────────────────────────────────────
// For tournaments flighted into draws of 16 or fewer players.
// Round Robin, Round Robin with Playoff, and Team Tournaments are excluded.
// Position points by flight + consolation per-win points by flight.
const flightedL4 = {
  profileName: 'Flighted L4',
  drawTypes: [
    MODIFIED_FEED_IN_CHAMPIONSHIP,
    COMPASS,
    FIRST_MATCH_LOSER_CONSOLATION,
    SINGLE_ELIMINATION,
    FEED_IN_CHAMPIONSHIP,
    FEED_IN_CHAMPIONSHIP_TO_SF,
  ],
  levels: [4],
  maxFlightNumber: 4,
  maxDrawSize: 16,
  finishingPositionPoints: { participationOrders: [1] },
  finishingPositionRanges: {
    1: { flights: [540, 351, 270, 189] },
    2: { flights: [405, 263, 203, 142] },
    3: { flights: [324, 211, 162, 113] },
    4: { flights: [270, 176, 135, 95] },
    8: { flights: [76, 49, 38, 26] },
  },
  perWinPoints: {
    participationOrders: [2, 3, 4, 5],
    level: { 4: { f: [57, 37, 28, 20] } },
  },
};

// ── Page 8: Flighted Level 5 Tournament ───────────────────────────────────────
// For tournaments flighted into draws of 16 or fewer players.
// Round Robin, Round Robin with Playoff, and Team Tournaments are excluded.
const flightedL5 = {
  profileName: 'Flighted L5',
  drawTypes: [
    MODIFIED_FEED_IN_CHAMPIONSHIP,
    COMPASS,
    FIRST_MATCH_LOSER_CONSOLATION,
    SINGLE_ELIMINATION,
    FEED_IN_CHAMPIONSHIP,
    FEED_IN_CHAMPIONSHIP_TO_SF,
  ],
  levels: [5],
  maxFlightNumber: 4,
  maxDrawSize: 16,
  finishingPositionPoints: { participationOrders: [1] },
  finishingPositionRanges: {
    1: { flights: [300, 195, 150, 105] },
    2: { flights: [225, 146, 113, 79] },
    3: { flights: [180, 117, 90, 63] },
    4: { flights: [150, 98, 75, 53] },
    8: { flights: [42, 27, 21, 15] },
  },
  perWinPoints: {
    participationOrders: [2, 3, 4, 5],
    level: { 5: { f: [32, 20, 16, 11] } },
  },
};

// ── Page 7: Curtis Consolation (Levels 1-5 only) ─────────────────────────────
// Max draw size is 64. R64 and R32 losers → consolation. R16 and QF losers → Curtis Consolation.
//
// Position keys map to finishingPositionRange max values:
//   1: Champion, 2: Finalist, 3: 3rd, 4: 4th/SF
//   5: Curtis Consolation Winner, 6: Curtis Consolation Runner Up
//   8: Curtis Consolation SF (7-8), 12: Curtis Consolation QF (9-12)
//   16: Curtis Consolation R16 (13-16), 32: Reached R32 (17-32)
const curtisConsolation = {
  profileName: 'Curtis Consolation L1-5',
  drawTypes: [CURTIS_CONSOLATION],
  levels: [1, 2, 3, 4, 5],
  finishingPositionRanges: {
    1: { level: { 1: 3000, 2: 1650, 3: 900, 4: 540, 5: 300 } },
    2: { level: { 1: 2400, 2: 1238, 3: 675, 4: 405, 5: 225 } },
    3: { level: { 1: 1950, 2: 990, 3: 540, 4: 324, 5: 180 } },
    4: { level: { 1: 1800, 2: 825, 3: 450, 4: 270, 5: 150 } },
    5: { level: { 1: 1350, 2: 578, 3: 315, 4: 189, 5: 105 } },
    6: { level: { 1: 1050, 2: 528, 3: 288, 4: 173, 5: 96 } },
    8: { level: { 1: 930, 2: 479, 3: 261, 4: 157, 5: 87 } },
    12: { level: { 1: 840, 2: 429, 3: 234, 4: 140, 5: 78 } },
    16: { level: { 1: 750, 2: 396, 3: 216, 4: 130, 5: 72 } },
    32: { level: { 1: 390, 2: 87, 3: 47, 4: 28, 5: 16 } },
  },
  // Per-win points in consolation with R64 and R32 losers
  pointsPerWin: { level: { 1: 60, 2: 54, 3: 29, 4: 18, 5: 10 } },
};

// ── Page 5: Feed-In Championship through Quarterfinals (Levels 1-5) ──────────
// Position keys map to finishingPositionRange max values.
// Qualifier positions are interleaved where main-draw R1 losers are fed into the FIC.
//
// Position mapping (for largest draw sizes):
//   1: Champion, 2: Finalist, 3: 3rd, 4: 4th
//   5: FIC Winner (5th), 6: FIC Runner Up (6th)
//   8: FIC Semifinalist (7-8), 12: FIC Quarterfinalist (9-12)
//   16: FIC QF Qualifier — R1 losers from 16-draw fed in (13-16)
//   24: Reached FIC R16 (17-24)
//   32: FIC R16 Qualifier — R1 losers from 32-draw fed in (25-32)
//   48: Reached FIC R32 (33-48)
//   64: FIC R32 Qualifier — R1 losers from 64-draw fed in (49-64)
//   96: Reached FIC R64 (65-96)
//   128: FIC R64 Qualifier — R1 losers from 128-draw fed in (97-128)
//   192: Reached FIC R128 (129-192)
//   256: FIC R128 Qualifier — R1 losers from 192 & 256-draw fed in (193-256)
const ficThroughQF_L1to5 = {
  profileName: 'FIC through QF L1-5',
  drawTypes: [FEED_IN_CHAMPIONSHIP_TO_QF],
  levels: [1, 2, 3, 4, 5],
  finishingPositionRanges: {
    // Main draw top 4
    1: { level: { 1: 3000, 2: 1650, 3: 900, 4: 540, 5: 300 } },
    2: { level: { 1: 2400, 2: 1238, 3: 675, 4: 405, 5: 225 } },
    3: { level: { 1: 1950, 2: 990, 3: 540, 4: 324, 5: 180 } },
    4: { level: { 1: 1800, 2: 825, 3: 450, 4: 270, 5: 150 } },
    // FIC positions
    5: { level: { 1: 1350, 2: 578, 3: 315, 4: 189, 5: 105 } },
    6: { level: { 1: 1050, 2: 495, 3: 270, 4: 162, 5: 90 } },
    8: { level: { 1: 900, 2: 396, 3: 216, 4: 130, 5: 72 } },
    12: { level: { 1: 750, 2: 347, 3: 189, 4: 113, 5: 63 } },
    // Interleaved qualifier positions
    16: { level: { 1: 600, 2: 297, 3: 162, 4: 97, 5: 54 } },
    24: { level: { 1: 450, 2: 231, 3: 126, 4: 76, 5: 42 } },
    32: { level: { 1: 360, 2: 198, 3: 108, 4: 65, 5: 36 } },
    48: { level: { 1: 300, 2: 149, 3: 81, 4: 49, 5: 27 } },
    64: { level: { 1: 210, 2: 116, 3: 63, 4: 38, 5: 21 } },
    96: { level: { 1: 150, 2: 83, 3: 45, 4: 27, 5: 15 } },
    128: { level: { 1: 90, 2: 50, 3: 27, 4: 16, 5: 9 } },
    192: { level: { 1: 60, 2: 33, 3: 18, 4: 11, 5: 6 } },
    256: { level: { 1: 30, 2: 17, 3: 9, 4: 5, 5: 3 } },
  },
  // FIC Consolation Draw per-win — currently only used at BG14 USTA National Championship
  // TODO: Scope this to category { ageCategoryCodes: ['U14'] } when category-scoped
  // perWinPoints are supported. For now included as a comment reference.
  // ficConsolationPerWin: { level: { 1: 15, 2: 8, 3: 5, 4: 3, 5: 2 } },
};

// ── Page 6: Feed-In Championship through R16 + Quarterfinal Playoffs (L1-5) ──
// The top 8 main-draw positions include a QF Playoff round for places 5-8.
// FIC determines places 9+.
//
// Position mapping:
//   1: Champion, 2: Finalist, 3: 3rd, 4: 4th
//   5: QF Playoff Winner, 6: QF Playoff Runner Up
//   8: QF Playoff R1 Losers (7-8)
//   9: FIC Winner (9th), 10: FIC Runner Up (10th)
//   12: FIC Semifinalist (11-12), 16: FIC Quarterfinalist (13-16)
//   24: Reached FIC R16 (17-24)
//   32: FIC R16 Qualifier — R1 losers from 32-draw (25-32)
//   48: Reached FIC R32 (33-48)
//   64: FIC R32 Qualifier — R1 losers from 64-draw (49-64)
//   96: Reached FIC R64 (65-96)
//   128: FIC R64 Qualifier — R1 losers from 128-draw (97-128)
//   192: Reached FIC R128 (129-192)
//   256: FIC R128 Qualifier — R1 losers from 192 & 256-draw (193-256)
const ficThroughR16WithPlayoffs_L1to5 = {
  profileName: 'FIC through R16 + QF Playoffs L1-5',
  drawTypes: [FEED_IN_CHAMPIONSHIP_TO_R16],
  levels: [1, 2, 3, 4, 5],
  finishingPositionRanges: {
    // Main draw top 4
    1: { level: { 1: 3000, 2: 1650, 3: 900, 4: 540, 5: 300 } },
    2: { level: { 1: 2400, 2: 1238, 3: 675, 4: 405, 5: 225 } },
    3: { level: { 1: 1950, 2: 990, 3: 540, 4: 324, 5: 180 } },
    4: { level: { 1: 1800, 2: 825, 3: 450, 4: 270, 5: 150 } },
    // QF Playoff positions
    5: { level: { 1: 1350, 2: 578, 3: 315, 4: 189, 5: 105 } },
    6: { level: { 1: 1080, 2: 528, 3: 288, 4: 173, 5: 96 } },
    8: { level: { 1: 960, 2: 462, 3: 252, 4: 151, 5: 84 } },
    // FIC positions
    9: { level: { 1: 840, 2: 429, 3: 234, 4: 140, 5: 78 } },
    10: { level: { 1: 720, 2: 363, 3: 198, 4: 119, 5: 66 } },
    12: { level: { 1: 630, 2: 314, 3: 171, 4: 103, 5: 57 } },
    16: { level: { 1: 540, 2: 264, 3: 144, 4: 86, 5: 48 } },
    // FIC lower positions with interleaved qualifiers
    24: { level: { 1: 450, 2: 231, 3: 126, 4: 76, 5: 42 } },
    32: { level: { 1: 360, 2: 198, 3: 108, 4: 65, 5: 36 } },
    48: { level: { 1: 270, 2: 149, 3: 81, 4: 49, 5: 27 } },
    64: { level: { 1: 210, 2: 116, 3: 63, 4: 38, 5: 21 } },
    96: { level: { 1: 150, 2: 83, 3: 45, 4: 27, 5: 15 } },
    128: { level: { 1: 105, 2: 66, 3: 36, 4: 22, 5: 12 } },
    192: { level: { 1: 90, 2: 58, 3: 32, 4: 19, 5: 11 } },
    256: { level: { 1: 75, 2: 53, 3: 29, 4: 17, 5: 10 } },
  },
};

// ── Page 3: Standard Elimination Draws (Levels 1-5) ──────────────────────────
// Covers: Modified Feed In, Compass, First Match Consolation,
//         Voluntary Consolation, Single Elimination
// Also covers FEED_IN_CHAMPIONSHIP and FEED_IN_CHAMPIONSHIP_TO_SF which share
// the same main-draw position table (the full FIC only differs in FIC-specific
// positions which would be handled by position ranges from the factory).
//
// Players earn points per round for Levels 1-5.
// Position points for main draw (participationOrder 1).
// Per-win consolation points for non-main structures (participationOrders 2-5).
const eliminationL1to5 = {
  profileName: 'Elimination L1-5',
  drawTypes: [
    MODIFIED_FEED_IN_CHAMPIONSHIP,
    COMPASS,
    FIRST_MATCH_LOSER_CONSOLATION,
    SINGLE_ELIMINATION,
    // Full FIC variants share the same main-draw position table
    FEED_IN_CHAMPIONSHIP,
    FEED_IN_CHAMPIONSHIP_TO_SF,
  ],
  levels: [1, 2, 3, 4, 5],
  finishingPositionPoints: { participationOrders: [1] },
  finishingPositionRanges: {
    1: { level: { 1: 3000, 2: 1650, 3: 900, 4: 540, 5: 300 } },
    2: { level: { 1: 2400, 2: 1238, 3: 675, 4: 405, 5: 225 } },
    3: { level: { 1: 1950, 2: 990, 3: 540, 4: 324, 5: 180 } },
    4: { level: { 1: 1800, 2: 825, 3: 450, 4: 270, 5: 150 } },
    8: { level: { 1: 1110, 2: 578, 3: 315, 4: 189, 5: 105 } },
    16: { level: { 1: 750, 2: 297, 3: 162, 4: 97, 5: 54 } },
    32: { level: { 1: 450, 2: 165, 3: 90, 4: 54, 5: 30 } },
    64: { level: { 1: 270, 2: 99, 3: 54, 4: 32, 5: 18 } },
    128: { level: { 1: 120, 2: 66, 3: 36, 4: 22, 5: 12 } },
    256: { level: { 1: 90, 2: 33, 3: 18, 4: 11, 5: 6 } },
  },
  perWinPoints: [
    {
      participationOrders: [2, 3, 4, 5],
      level: { 1: 105, 2: 62, 3: 32, 4: 19, 5: 11 },
    },
  ],
};

// ── Page 3 + 5 + 6: All Elimination Draws (Levels 6-7) ──────────────────────
// At Levels 6-7, ALL non-RR non-Team draw formats use the same per-win structure:
//   Main Draw Wins: 20 (L6) / 12 (L7)
//   Consolation Wins: 10 (L6) / 6 (L7)
//   Champion Bonus: 15 (L6) / 8 (L7)
//   Finalist Bonus: 10 (L6) / 6 (L7)
//   Max 4 matches
//
// Note: For Level 7 only compass is approved. For Level 6 only compass and
// modified feed-in are approved. But the profile covers all draw types for safety.
const eliminationL6to7 = {
  profileName: 'Elimination L6-7',
  drawTypes: [
    MODIFIED_FEED_IN_CHAMPIONSHIP,
    COMPASS,
    FIRST_MATCH_LOSER_CONSOLATION,
    SINGLE_ELIMINATION,
    FEED_IN_CHAMPIONSHIP,
    FEED_IN_CHAMPIONSHIP_TO_SF,
    FEED_IN_CHAMPIONSHIP_TO_QF,
    FEED_IN_CHAMPIONSHIP_TO_R16,
    CURTIS_CONSOLATION,
    VOLUNTARY_CONSOLATION,
  ],
  levels: [6, 7],
  perWinPoints: [
    { participationOrders: [1], level: { 6: 20, 7: 12 } },
    { participationOrders: [2, 3, 4, 5], level: { 6: 10, 7: 6 } },
  ],
  maxCountableMatches: 4,
  bonusPoints: [
    { finishingPositions: [1], value: { level: { 6: 15, 7: 8 } } },
    { finishingPositions: [2], value: { level: { 6: 10, 7: 6 } } },
  ],
};

// ─── Quality Win Profiles ────────────────────────────────────────────────────

// ── Page 8: Bonus Points for Wins vs. Ranked Opponents ───────────────────────
const qualityWinProfiles = [
  {
    rankingScaleName: 'USTA_JUNIOR',
    rankingSnapshot: 'tournamentStart' as const,
    unrankedOpponentBehavior: 'noBonus' as const,
    includeWalkovers: false,
    rankingRanges: [
      { rankRange: [1, 10] as [number, number], value: 225 },
      { rankRange: [11, 25] as [number, number], value: 203 },
      { rankRange: [26, 50] as [number, number], value: 169 },
      { rankRange: [51, 75] as [number, number], value: 135 },
      { rankRange: [76, 100] as [number, number], value: 101 },
      { rankRange: [101, 150] as [number, number], value: 68 },
      { rankRange: [151, 250] as [number, number], value: 45 },
      { rankRange: [251, 350] as [number, number], value: 23 },
      { rankRange: [351, 500] as [number, number], value: 11 },
    ],
  },
];

// ─── Aggregation Rules ───────────────────────────────────────────────────────

// USTA Junior ranking lists are per-gender per-age-category.
// Counting rules: best 6 singles + best 2 doubles + all quality wins.
// These counting rules are approximate — verify exact USTA counting rules.
const aggregationRules = {
  rollingPeriodDays: 365,
  separateByGender: true,
  perCategory: true,

  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] as const,
    },
    {
      bucketName: 'Doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 2,
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] as const,
    },
    {
      bucketName: 'Quality Wins',
      pointComponents: ['qualityWinPoints'] as const,
      bestOfCount: 0, // count all quality win points (no cap)
    },
  ],

  tiebreakCriteria: ['highestSingleResult', 'mostCountingResults'] as const,
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

/**
 * Award profiles are ordered from most specific to least specific.
 *
 * Profile matching order:
 *   1. RR Playoff L3-5 bracket profiles (most specific: drawType + level + participationOrder + stage)
 *   2. RR Playoff L6-7
 *   3. Round Robin L3-5, L6-7
 *   4. Team Tournaments
 *   5. Flighted L4, Flighted L5 (specific level + maxFlightNumber + maxDrawSize)
 *   6. Curtis Consolation L1-5
 *   7. FIC through QF L1-5, FIC through R16 L1-5 (specific drawType + level)
 *   8. Elimination L1-5 (broad drawType catch-all for L1-5)
 *   9. Elimination L6-7 (broad drawType catch-all for L6-7)
 */
const awardProfiles = [
  // RR with Playoff bracket profiles (most specific)
  rrWithPlayoffL3to5_ChampionMain,
  rrWithPlayoffL3to5_ChampionConsolation,
  rrWithPlayoffL3to5_PlacementBrackets,
  rrWithPlayoffL3to5_PreliminaryRR,
  rrWithPlayoffL6to7,

  // Round Robin
  roundRobinL3to5,
  roundRobinL6to7,

  // Team
  teamTournaments,

  // Flighted (must be before standard elimination to match first for flighted events)
  flightedL4,
  flightedL5,

  // Curtis (specific drawType, before generic elimination)
  curtisConsolation,

  // FIC variants (specific drawTypes, before generic elimination)
  ficThroughQF_L1to5,
  ficThroughR16WithPlayoffs_L1to5,

  // Standard elimination (broad catch-all)
  eliminationL1to5,
  eliminationL6to7,
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_USTA_JUNIOR = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'USTA Junior 2025',
    policyVersion: '2025.01',
    validDateRange: { startDate: '2025-01-01' },

    awardProfiles,
    qualityWinProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_USTA_JUNIOR;
