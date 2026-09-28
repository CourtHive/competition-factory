export { validateSetScore, validateMatchUpScore } from '@Validators/validateMatchUpScore';
export { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
export { validateTieFormat } from '@Validators/validateTieFormat';
export { validateScore } from '@Validators/validateScore';

export { getSetComplement, getTiebreakComplement, getMaxSetScore } from '@Query/matchUp/getComplement';
export { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
export { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
export { analyzeScore } from '@Query/matchUp/analyzeScore';
export { parseScoreString } from '@Tools/parseScoreString';
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
