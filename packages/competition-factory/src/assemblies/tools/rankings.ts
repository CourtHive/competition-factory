/**
 * Ranking functions over values the caller holds: stateless (CA 2026-11-08). The rolling award window is the one
 * definition factory's `generateRankingList` applies, exported so a service that pre-filters its own store uses the
 * same bounds. `deriveRankingList` is the ranking governor's `applyDerivedRankings` under a name that says what it does:
 * it derives a sub-list (an age or category cut) from ranked entries and renumbers it. The governor name goes at 8.0.0.
 * `getParticipantPoints` (one person's bucketed total from point awards) and `getQualityWinPoints` (quality-win bonuses
 * from won matchUps and opponents' rankings) read only what they are passed; their ranking-governor engine routes go at
 * 8.0.0 and this is where an integrator calls them (CA 2026-11-25).
 * Their home is `tools.rankings`, the planned `ratings` package.
 *
 * Below them, the ranking governor's stateless queries that take one params object (confirmed stateless, Mentat
 * FACTORY_ENGINE_API_MIGRATION_PREP_PLAN slice A), and the participant governor's scale readers over a participant the
 * caller holds. Each refuses a missing input rather than throwing. The governors keep them in 7.x; their engine routes
 * are unchanged.
 */
export { computeAwardWindow, isAwardInWindow, rollingPeriodDaysFrom } from '@Query/scales/awardWindow';
export { applyDerivedRankings as deriveRankingList } from '@Query/scales/applyDerivedRankings';
export { getParticipantPoints } from '@Query/scales/getParticipantPoints';
export { getQualityWinPoints } from '@Query/scales/getQualityWinPoints';
export { DEFAULT_ROLLING_PERIOD_DAYS } from '@Query/scales/awardWindow';

// params-object queries, also rankingGovernor and participantGovernor (getScaleValues, participantScaleItem)
export { participantScaleItem } from '@Query/participant/participantScaleItem';
export { generateRankingList } from '@Query/scales/generateRankingList';
export { getScaleValues } from '@Query/participant/getScaleValues';
export { getAwardProfile } from '@Query/scales/getAwardProfile';
export { getAwardPoints } from '@Query/scales/getAwardPoints';
