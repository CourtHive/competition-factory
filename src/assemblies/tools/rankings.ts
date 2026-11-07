/**
 * Ranking functions over values the caller holds: stateless (CA 2026-11-08). The rolling award window is the one
 * definition factory's `generateRankingList` applies, exported so a service that pre-filters its own store uses the
 * same bounds. `deriveRankingList` is the ranking governor's `applyDerivedRankings` under a name that says what it does:
 * it derives a sub-list (an age or category cut) from ranked entries and renumbers it. The governor name goes at 8.0.0.
 * Their home is `tools.rankings`, the planned `ratings` package.
 */
export { computeAwardWindow, isAwardInWindow, rollingPeriodDaysFrom } from '@Query/scales/awardWindow';
export { applyDerivedRankings as deriveRankingList } from '@Query/scales/applyDerivedRankings';
export { DEFAULT_ROLLING_PERIOD_DAYS } from '@Query/scales/awardWindow';
