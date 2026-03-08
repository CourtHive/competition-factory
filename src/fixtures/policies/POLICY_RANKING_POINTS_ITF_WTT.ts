/**
 * ITF World Tennis Tour Ranking System — Ranking Points Policy
 *
 * Source: itf-points-explained.pdf (2020 rules, current system)
 *
 * The ITF World Tennis Ranking is a parallel ranking system to ATP/WTA rankings.
 * From 2020, ITF points are ONLY awarded for qualifying rounds at $15,000 and
 * $25,000 tournaments. Main draw results earn ATP/WTA points instead.
 *
 * Tournament Tiers (mapped to factory levels):
 *   Level 1: $25,000 +H (with hospitality)
 *   Level 2: $25,000
 *   Level 3: $15,000 +H (with hospitality)
 *   Level 4: $15,000
 *
 * Points are identical for Men's and Women's singles/doubles.
 * Ranking lists are separate by gender.
 *
 * Aggregation: Best 14 results from rolling 52-week period.
 *
 * Doubles: Same points as singles from QF to Winner. No points for R16 loss.
 * In 2020 qualifying-only system, doubles qualifying points follow same rules.
 */

import { QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';

// ─── Award Profiles ──────────────────────────────────────────────────────────

// ── Qualifying: Singles & Doubles ────────────────────────────────────────────
// From 2020, ITF points are only awarded for qualifying rounds.
// Q (Qualifier) = player who wins through qualifying to the main draw.
// FRQ (Final Round Qualifying loser) = lost in the last qualifying round.
//
// Position mapping for qualifying structures:
//   Position 1 (Qualifier): earns Q points
//   Position 2 (Final round loser): earns FRQ points
//   Position 3+ (earlier round losers): no ITF points
//
// Singles points:
//   $25,000 +H (L1): Q=4, FRQ=1
//   $25,000    (L2): Q=3, FRQ=1
//   $15,000 +H (L3): Q=3, FRQ=1
//   $15,000    (L4): Q=2, FRQ=1
const qualifyingSingles = {
  profileName: 'ITF WTT Qualifying Singles',
  levels: [1, 2, 3, 4],
  drawTypes: [SINGLE_ELIMINATION],
  eventTypes: [SINGLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    2: 1,
  },
};

// ── Qualifying: Doubles ──────────────────────────────────────────────────────
// Per the ITF rules: "In Doubles competitions at ITF tournaments, the same points
// are awarded between Quarter Final and Winner rounds as in Singles."
// In the 2020 qualifying-only system, doubles qualifying follows the same structure.
const qualifyingDoubles = {
  profileName: 'ITF WTT Qualifying Doubles',
  levels: [1, 2, 3, 4],
  drawTypes: [SINGLE_ELIMINATION],
  eventTypes: [DOUBLES],
  stages: [QUALIFYING],
  finishingPositionRanges: {
    1: { level: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    2: 1,
  },
};

// ─── Historical 2019 Main Draw Profiles (for reference) ─────────────────────
// In 2019, ITF also awarded main draw points at $15K/$25K events.
// These are preserved as comments for historical policy support if needed.
//
// Men's Singles 2019:
//   $25,000 +H: W=225, F=135, SF=67, QF=27, R16=9, R32=0, Q=3, FRQ=1
//   $25,000:    W=150, F=90,  SF=45, QF=18, R16=6, R32=0, Q=3, FRQ=1
//   $15,000 +H: W=150, F=90,  SF=45, QF=18, R16=6, R32=0, Q=3, FRQ=1
//   $15,000:    W=100, F=60,  SF=30, QF=12, R16=4, R32=0, Q=2, FRQ=1
//
// Women's Singles 2019:
//   $25,000 +H: Q=4, FRQ=1 (no main draw ITF points — WTA points instead)
//   $25,000:    Q=3, FRQ=1 (no main draw ITF points — WTA points instead)
//   $15,000 +H: W=150, F=90, SF=45, QF=18, R16=6, R32=0, Q=3, FRQ=1
//   $15,000:    W=100, F=60, SF=30, QF=12, R16=4, R32=0, Q=2, FRQ=1

// ─── Aggregation Rules ───────────────────────────────────────────────────────

// ITF World Tennis Ranking: best 14 results from rolling 52 weeks.
// Ranking lists are separate by gender but not by category.
const aggregationRules = {
  rollingPeriodDays: 364, // 52 weeks
  separateByGender: true,
  perCategory: false,
  bestOfCount: 14,
};

// ─── Assembled Policy ────────────────────────────────────────────────────────

const awardProfiles = [qualifyingSingles, qualifyingDoubles];

export const POLICY_RANKING_POINTS_ITF_WTT = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'ITF World Tennis Tour 2020',
    policyVersion: '2020.01',
    validDateRange: { startDate: '2020-01-01' },

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
  },
};

export default POLICY_RANKING_POINTS_ITF_WTT;
