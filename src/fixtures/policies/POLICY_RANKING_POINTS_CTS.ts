/**
 * Czech Tennis Association (Český tenisový svaz, ČTS) — Klasifikační řád 2025
 *
 * Source: ČTS Klasifikační řád ("Classification Order"), 2025 edition.
 *         Mentat/planning/RANKING_LISTS_PIPELINE_CTS2025_KLASIFIKACE.txt
 *         (offline extracted text)
 *
 * Key articles encoded here:
 *   - Article 2: "The U16 ranking list (mladší dorost) is a reduced extract
 *     from the U18 (dorost) ranking list and is not maintained separately."
 *     → encoded via `derivedRankings`.
 *   - Article 21: "In all categories, the eight best singles and doubles
 *     results count." → encoded via `countingBuckets[].bestOfCount = 8`.
 *   - Article 28: "Re-rating results from a higher age category to a lower
 *     one (or the reverse) is NOT performed." → encoded via empty
 *     `categoryAggregation: []`.
 *
 * Classification periods (Article 27): two classification periods per
 * season — winter (October-September) and summer (April-March). The
 * pipeline runs separate snapshots per period; `rollingPeriodDays` is
 * still 365 within each period. Future revisions may encode the two
 * periods as policy variants with explicit `validDateRange` boundaries.
 *
 * TODO: encode Tabulka IV (point values for 21 tournament categories).
 * The extracted regulations text references Tabulka II / Tabulka IV but
 * the full numeric table is truncated. AwardProfiles are stubbed pending
 * a full PDF capture; do not fabricate values.
 */

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// ─── Award Profiles ──────────────────────────────────────────────────────────

// TODO: encode Tabulka IV from full ČTS Klasifikační řád PDF (extracted text
// referenced the table but the numeric values were truncated in
// Mentat/planning/RANKING_LISTS_PIPELINE_CTS2025_KLASIFIKACE.txt). The 21
// tournament categories from Tabulka II need their per-position point
// values populated here before the policy is usable for actual scoring.
const awardProfiles: object[] = [];

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

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_CTS;
