/**
 * Czech Tennis Association (Český tenisový svaz, ČTS) — Klasifikační řád 2025
 *
 * Source: ČTS Klasifikační řád ("Classification Order"), 2025 edition.
 *         Mentat/planning/RANKING_LISTS_PIPELINE_CTS2025_KLASIFIKACE.txt
 *         (offline extracted text — lines 423-443 carry the full Tabulka IV;
 *         the earlier policy comment claiming the table was truncated was
 *         mistaken, the table is intact in the extract).
 *
 * Key articles encoded here:
 *   - Article 2: "The U16 ranking list (mladší dorost) is a reduced extract
 *     from the U18 (dorost) ranking list and is not maintained separately."
 *     → encoded via `derivedRankings`.
 *   - Article 11/12: Tournament category resolution. Fixed-category defaults:
 *       MČR  → 15  (Mistrovství České republiky)
 *       A    → 12  (or higher if 8-best-BH dictates)
 *       B    → 8   (or higher per BH)
 *       C    → 3   (capped at 7)
 *       D    → 2
 *     P (Plus) and E aren't in Article 12; we use P→13, E→1 as inferences
 *     pending federation clarification.
 *   - Article 21: "In all categories, the eight best singles and doubles
 *     results count." → `countingBuckets[].bestOfCount = 8`.
 *   - Article 28: "Re-rating results from a higher age category to a lower
 *     one (or the reverse) is NOT performed." → empty `categoryAggregation`.
 *
 * Classification periods (Article 27): two classification periods per
 * season — winter (October-September) and summer (April-March). The
 * pipeline runs separate snapshots per period; `rollingPeriodDays` stays
 * 365 within each period.
 */

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { MAIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

// ─── Tabulka IV ──────────────────────────────────────────────────────────────
//
// Each row carries point values for the eight singles finishing rounds AND
// the eight doubles finishing rounds. Layout (column index → finishing round):
//
//   col   singles      doubles
//   0     V                       — winner (singles only at this col)
//   1     F                       — finalist (singles only)
//   2     SF           V           — SF losers / doubles winner
//   3     R8/QF        F           — QF losers / doubles finalist
//   4     R16          SF
//   5     R32          R8/QF
//   6     R64          R16
//   7     R128         R32
//   8                  R64        — only present at higher categories
//   9                  R128       — only present at higher categories
//
// Categories 1-5 carry only 8 cols (no R64/R128 for doubles); categories
// 6-21 carry 9-10 cols.

const TABULKA_IV: Record<number, number[]> = {
  1: [10, 7, 5, 4, 3, 2, 1, 0],
  2: [15, 11, 7, 5, 4, 3, 2, 0],
  3: [20, 14, 10, 7, 5, 4, 3, 0],
  4: [30, 20, 14, 10, 7, 5, 4, 0],
  5: [40, 27, 19, 13, 9, 6, 4, 0],
  6: [50, 34, 23, 16, 11, 8, 5, 3, 1],
  7: [60, 41, 28, 19, 13, 9, 6, 4, 2],
  8: [80, 55, 38, 25, 17, 12, 8, 6, 4, 2],
  9: [100, 69, 48, 33, 22, 15, 10, 7, 5, 3],
  10: [120, 82, 57, 39, 27, 18, 12, 8, 6, 4],
  11: [170, 117, 81, 56, 39, 27, 19, 13, 9, 6],
  12: [200, 138, 96, 67, 47, 33, 23, 16, 11, 7],
  13: [230, 159, 110, 76, 53, 37, 26, 18, 12, 8],
  14: [260, 180, 125, 87, 60, 42, 29, 20, 14, 10],
  15: [300, 207, 143, 99, 69, 48, 34, 23, 16, 11],
  16: [340, 235, 163, 113, 78, 54, 38, 26, 16, 12],
  17: [380, 263, 182, 126, 87, 60, 42, 29, 20, 14],
  18: [420, 290, 200, 138, 96, 67, 47, 32, 22, 15],
  19: [460, 318, 220, 152, 105, 73, 51, 35, 24, 16],
  20: [500, 345, 238, 165, 114, 79, 55, 38, 26, 18],
  21: [600, 414, 286, 198, 137, 95, 66, 46, 32, 22],
};

const CATEGORIES = Array.from({ length: 21 }, (_, i) => i + 1);

// finishingPositionRanges keys are the upper bound of the range (1=winner,
// 2=finalist, 4=SF losers occupy positions 3-4, 8=QF losers occupy 5-8, …).
// For each range, the value is { level: { <category>: <points> } }.
const FINISHING_RANGES = [
  { rangeKey: 1, colSingles: 0, colDoubles: 2 },
  { rangeKey: 2, colSingles: 1, colDoubles: 3 },
  { rangeKey: 4, colSingles: 2, colDoubles: 4 },
  { rangeKey: 8, colSingles: 3, colDoubles: 5 },
  { rangeKey: 16, colSingles: 4, colDoubles: 6 },
  { rangeKey: 32, colSingles: 5, colDoubles: 7 },
  { rangeKey: 64, colSingles: 6, colDoubles: 8 },
  { rangeKey: 128, colSingles: 7, colDoubles: 9 },
];

function buildRanges(row: number[], col: 'colSingles' | 'colDoubles'): Record<number, number> {
  const out: Record<number, number> = {};
  for (const range of FINISHING_RANGES) {
    const v = row[range[col]];
    if (typeof v === 'number') out[range.rangeKey] = v;
  }
  return out;
}

function buildProfile(level: number, eventType: 'SINGLES' | 'DOUBLES'): object {
  const row = TABULKA_IV[level];
  const ranges = buildRanges(row, eventType === 'SINGLES' ? 'colSingles' : 'colDoubles');
  return {
    profileName: `CTS ${eventType} Cat ${level}`,
    drawTypes: [SINGLE_ELIMINATION],
    eventTypes: [eventType === 'SINGLES' ? SINGLES : DOUBLES],
    stages: [MAIN],
    levels: [level],
    finishingPositionRanges: ranges,
  };
}

// ─── Award Profiles ──────────────────────────────────────────────────────────
//
// One profile per (level, eventType). 21 categories × 2 event types = 42
// profiles. Matches Tennis Europe's encoding pattern (POLICY_RANKING_POINTS_TENNIS_EUROPE)
// — plain numbers in finishingPositionRanges, no nested `level` maps (which
// the factory's award selector doesn't traverse).

const awardProfiles = [
  ...CATEGORIES.map((cat) => buildProfile(cat, 'SINGLES')),
  ...CATEGORIES.map((cat) => buildProfile(cat, 'DOUBLES')),
];

// ─── Tier → Level mapping ────────────────────────────────────────────────────
//
// CTS encodes its tournament class on the tournament record's tier under the
// system 'CTS'. Mapped values follow Article 12 defaults; the actual category
// can be higher when the eight-best-BH calculation lifts it.
//
// Note: Tabulka III lists international tournaments (TEJT, ITF, ATP) on the
// same 1-21 scale. Future revisions can add 'ITF_JUNIOR', 'TEJT', 'WTA',
// etc. systems here so a Czech-junior who played a TEJT event has those
// results scored on the same scale.

const tierToLevel = {
  CTS: {
    MČR: 15,
    P: 13,
    A: 12,
    B: 8,
    C: 3,
    D: 2,
    E: 1,
  },
};

// ─── Aggregation Rules ───────────────────────────────────────────────────────

const aggregationRules = {
  // 12-month classification period within each of the two season windows
  // (winter Oct-Sep, summer Apr-Mar). See note above.
  rollingPeriodDays: 365,
  separateByGender: true,
  perCategory: true,

  countingBuckets: [
    {
      bucketName: 'singles',
      eventTypes: [SINGLES],
      bestOfCount: 8,
      pointComponents: ['positionPoints'] as const,
    },
    {
      bucketName: 'doubles',
      eventTypes: [DOUBLES],
      bestOfCount: 8,
      pointComponents: ['positionPoints'] as const,
    },
  ],

  // Article 28: no cross-category rerate. Empty by policy.
  categoryAggregation: [],
};

// ─── Derived Rankings ────────────────────────────────────────────────────────

const derivedRankings = [
  // Article 2: U16 (ml. dorost) ranking is a filtered extract of the
  // U18 (dorost) ranking. Filter is the age range max = 16 at snapshot date.
  {
    category: { ageCategoryCodes: ['U16'] },
    derivedFrom: { ageCategoryCodes: ['U18'] },
    filter: { ageRange: { max: 16 } },
  },
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const POLICY_RANKING_POINTS_CTS = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'ČTS Klasifikační řád 2025',
    policyVersion: '2025.01',
    validDateRange: { startDate: '2025-01-01' },

    pointPoolModel: 'per-category' as const,

    awardProfiles,
    aggregationRules,
    derivedRankings,
    tierToLevel,

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_CTS;
