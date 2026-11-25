/**
 * Ranking functions over values the caller holds: stateless (CA 2026-11-08). The rolling award window is the one
 * definition factory's `generateRankingList` applies, exported so a service that pre-filters its own store uses the
 * same bounds. `deriveRankingList` is the ranking governor's `applyDerivedRankings` under a name that says what it does:
 * it derives a sub-list (an age or category cut) from ranked entries and renumbers it. The governor name goes at 8.0.0.
 * `getParticipantPoints` (one person's bucketed total from point awards) and `getQualityWinPoints` (quality-win bonuses
 * from won matchUps and opponents' rankings) read only what they are passed; their ranking-governor engine routes go at
 * 8.0.0 and this is where an integrator calls them (CA 2026-11-25).
 * Their home is `tools.rankings`, the planned `ratings` package.
 */
export { computeAwardWindow, isAwardInWindow, rollingPeriodDaysFrom } from '@Query/scales/awardWindow';
export { applyDerivedRankings as deriveRankingList } from '@Query/scales/applyDerivedRankings';
export { getParticipantPoints } from '@Query/scales/getParticipantPoints';
export { getQualityWinPoints } from '@Query/scales/getQualityWinPoints';
export { DEFAULT_ROLLING_PERIOD_DAYS } from '@Query/scales/awardWindow';
