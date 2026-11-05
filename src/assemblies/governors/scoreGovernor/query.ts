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
export { getScore } from '@Scoring/v1/getScore';
export type { GetScoreOptions } from '@Scoring/v1/getScore';
export { getScoreboard } from '@Scoring/v1/getScoreboard';
export { getWinner } from '@Scoring/v1/getWinner';
export { isComplete } from '@Scoring/v1/isComplete';
export { deduceMatchUpFormat } from '@Helpers/matchUpFormatCode/deduceMatchUpFormat';
export { getEpisodes } from '@Scoring/v1/getEpisodes';

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
