/**
 * Federated rank-list — Illustrative Reference Fixture
 *
 * ▲ ILLUSTRATIVE ONLY ▲
 *
 * This fixture is NOT a published rulebook. The point values below are
 * placeholders chosen to demonstrate the three-bucket federated pattern;
 * they are not calibrated to any federation's actual scoring rules.
 *
 * Purpose: serve as a worked reference for the per-AwardProfile
 * `pointsAuthority` override (shipped 2026-05-21). Tennis Europe's
 * production rank list — observed in `CourtHive/ExampleTennisEuropeRankList.json`
 * — sums three authority buckets into one Totalpoints:
 *
 *   Points    = TENNIS_EUROPE (TE-circuit events)
 *   ITF       = ITF / ITF_JUNIOR (ITF-sanctioned events)
 *   Pro       = ATP / WTA (Tour-level events)
 *
 * One policy, three profiles, each profile stamping its issuing authority
 * onto the awards it matches. The factory's `getTournamentPoints`
 * resolves `award.pointsAuthority = matchedProfile.pointsAuthority ??
 * policy.pointsAuthority`. The rankings pipeline's `authorityFilter` and
 * `authorityWeights` (courthive-rankings AggregateArgs) then scope and
 * weight at snapshot generation.
 *
 * Real-world use: copy this file, replace the placeholder point values
 * with figures from the actual published rulebook, and update profile
 * scopes (levels, drawSizes, eventTypes) to match the federation's
 * event taxonomy. The shape — one policy, multiple profiles, per-profile
 * pointsAuthority — is the durable pattern.
 *
 * See: factory/documentation/docs/policies/rankingPolicy.md
 * §"Per-AwardProfile override"
 */

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { ATP, ITF_JUNIOR, TENNIS_EUROPE } from '@Constants/pointsAuthorityConstants';
import { SINGLES } from '@Constants/eventConstants';

// ─── TE-circuit profile (inherits policy.pointsAuthority = TENNIS_EUROPE) ──

// Most TE-circuit events are age-restricted (12U / 14U / 16U / 18U).
// This example scopes a single 18U Main-Draw profile; a real fixture
// would add 14U + 16U variants and a 12U starting-points profile.
const teCircuit18U = {
  profileName: 'TE Circuit 18&U (example)',
  eventTypes: [SINGLES],
  drawTypes: [SINGLE_ELIMINATION],
  stages: [MAIN],
  category: { ageCategoryCodes: ['18U'] },
  finishingPositionRanges: {
    1: 250,
    2: 180,
    4: 120,
    8: 80,
    16: 50,
    32: 25,
  },
  pointsPerWin: 10,
  // No explicit pointsAuthority — inherits TENNIS_EUROPE from the policy.
};

const teCircuit18UQualifying = {
  profileName: 'TE Circuit 18&U Qualifying (example)',
  eventTypes: [SINGLES],
  drawTypes: [SINGLE_ELIMINATION],
  stages: [QUALIFYING],
  category: { ageCategoryCodes: ['18U'] },
  finishingPositionRanges: {
    1: 30,
    2: 20,
    4: 10,
  },
};

// ─── ITF Junior crossover profile (overrides authority → ITF_JUNIOR) ──────

// Matches ITF Junior events (Grade A → J100) that TE-eligible players
// also enter. Scoped by level so the specificity scorer picks this over
// the TE-circuit profile when an ITF-Junior level is supplied at compute
// time.
const itfJuniorCrossover = {
  profileName: 'ITF Junior crossover (example)',
  pointsAuthority: ITF_JUNIOR,
  eventTypes: [SINGLES],
  drawTypes: [SINGLE_ELIMINATION],
  stages: [MAIN],
  category: { ageCategoryCodes: ['18U'] },
  levels: [4, 5, 6], // Stand-in for ITF Junior grades — calibrate against real grade-to-level mapping.
  finishingPositionRanges: {
    1: { level: { 4: 1000, 5: 600, 6: 350 } },
    2: { level: { 4: 700, 5: 420, 6: 245 } },
    4: { level: { 4: 450, 5: 270, 6: 160 } },
    8: { level: { 4: 250, 5: 150, 6: 90 } },
    16: { level: { 4: 150, 5: 90, 6: 50 } },
    32: { level: { 4: 80, 5: 50, 6: 25 } },
  },
};

// ─── ATP crossover profile (overrides authority → ATP) ────────────────────

// Matches ATP Tour and Challenger events that TE-eligible juniors enter.
// Scoped by level; the ATP fixture uses level 5–8 for ATP 500/250 and
// 9–13 for Challengers, so this profile sits in the same numeric range
// but with placeholder point values.
const atpCrossover = {
  profileName: 'ATP crossover (example)',
  pointsAuthority: ATP,
  eventTypes: [SINGLES],
  drawTypes: [SINGLE_ELIMINATION],
  stages: [MAIN],
  levels: [7, 8, 9, 10, 11], // Stand-in for ATP 250 / Challenger tiers.
  finishingPositionRanges: {
    1: { level: { 7: 250, 8: 250, 9: 175, 10: 125, 11: 100 } },
    2: { level: { 7: 165, 8: 165, 9: 110, 10: 75, 11: 60 } },
    4: { level: { 7: 100, 8: 100, 9: 70, 10: 50, 11: 35 } },
    8: { level: { 7: 50, 8: 50, 9: 35, 10: 25, 11: 18 } },
    16: { level: { 7: 25, 8: 25, 9: 18, 10: 13, 11: 10 } },
  },
  pointsPerWin: 5,
};

// ─── Assembled Policy ────────────────────────────────────────────────────

const awardProfiles = [
  // ATP profile listed first so its (higher) levels specificity wins at
  // tied generic scope. Order is irrelevant when level/category/stage
  // distinguishes them, but listed in expected match-frequency order.
  atpCrossover,
  itfJuniorCrossover,
  teCircuit18U,
  teCircuit18UQualifying,
];

const aggregationRules = {
  rollingPeriodDays: 365,
  perCategory: false,
  separateByGender: true,
  minCountableResults: 1,
  countingBuckets: [
    {
      bucketName: 'singles',
      eventTypes: [SINGLES],
      bestOfCount: 12,
      pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'],
    },
  ],
  tiebreakCriteria: ['highestSingleResult', 'mostCountingResults'],
};

export const POLICY_RANKING_POINTS_HYBRID_EXAMPLE = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Federated Hybrid Example',
    policyVersion: '0.0.1-example',
    pointsAuthority: TENNIS_EUROPE,

    awardProfiles,
    aggregationRules,

    doublesAttribution: 'fullToEach' as const,
    categoryResolution: 'eventCategory' as const,
  },
};

export default POLICY_RANKING_POINTS_HYBRID_EXAMPLE;
