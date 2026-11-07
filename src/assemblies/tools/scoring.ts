/**
 * Scoring functions: stateless, positional, no engine (CA 2026-11-07). Score validators, readers of a scoring-engine
 * matchUp state, and point and statistics parsers. Their home is `tools.scoring`, the planned `scoring` package. They are
 * also exported by `scoreGovernor`, which mounts them on engines that cannot call them correctly; that placement goes
 * at 8.0.0.
 */
export { calculateMatchStatistics, enrichPointHistory, getQuickStats } from '@Query/scoring/statistics/standalone';
export { validateSetScore, validateMatchUpScore } from '@Scoring/analysis/validateMatchUpScore';
export { deduceMatchUpFormat } from '@Helpers/matchUpFormatCode/deduceMatchUpFormat';
export { validateMCPMatch, exportMatchUpJSON } from '@Scoring/replay/mcpValidator';
export { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
export { getSetScoreString } from '@Scoring/replay/validateMatchUp';
export { calculatePointsTo } from '@Scoring/v1/pointsToCalculator';
export { resolvePointValue } from '@Scoring/v1/resolvePointValue';
export { inferServeSide } from '@Scoring/v1/serveSideCalculator';
export { getScoreboard } from '@Scoring/v1/getScoreboard';
export { getEpisodes } from '@Scoring/v1/getEpisodes';
export { isComplete } from '@Scoring/v1/isComplete';
export { getWinner } from '@Scoring/v1/getWinner';
export { addPoint } from '@Scoring/v1/addPoint';
export { getScore } from '@Scoring/v1/getScore';
export {
  parseCSV,
  groupByMatch,
  parseMCPPoint,
  shotSplitter,
  analyzeSequence,
  pointParser,
  shotParser,
} from '@Scoring/replay/mcpParser';
