export { validateSetScore, validateMatchUpScore } from '@Scoring/analysis/validateMatchUpScore';
export { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
export { validateTieFormat } from '@Validators/validateTieFormat';
export { validateScore } from '@Scoring/analysis/validateScore';

export {
  getSetComplement,
  getTiebreakComplement,
  getMaxSetScore,
} from '@Helpers/matchUpFormatCode/setRules/setComplement';
export { retainScoreForFormat } from '@Query/matchUp/retainScoreForFormat';
export type { RetainScoreArgs, RetainedScore } from '@Query/matchUp/retainScoreForFormat';
export { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
export { checkSetIsComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
export { analyzeScore } from '@Scoring/analysis/analyzeScore';
export { parseScoreString } from '@Scoring/parse/parseScoreString';
export { analyzeSet } from '@Query/matchUp/analyzeSet';

// Point-by-point scoring queries
export { getScore } from '@Query/scoring/getScore';
export type { GetScoreOptions } from '@Query/scoring/getScore';
export { getScoreboard } from '@Query/scoring/getScoreboard';
export { getWinner } from '@Query/scoring/getWinner';
export { isComplete } from '@Query/scoring/isComplete';
export { deduceMatchUpFormat } from '@Query/scoring/deduceMatchUpFormat';
export { getEpisodes } from '@Query/scoring/getEpisodes';

// Statistics
export { calculateMatchStatistics, enrichPointHistory, getQuickStats } from '@Query/scoring/statistics/standalone';
export { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
export type {
  CalculatedStat,
  MatchStatistics,
  StatisticsOptions,
  StatCounters,
  StatObject,
} from '@Query/scoring/statistics/types';
