/**
 * Scoring functions: stateless, positional, no engine (CA 2026-11-07). Score validators, readers of a scoring-engine
 * matchUp state, and point and statistics parsers. Their home is `tools.scoring`, the planned `scoring` package. They are
 * also exported by `scoreGovernor`, which mounts them on engines that cannot call them correctly; that placement goes
 * at 8.0.0.
 *
 * Below them, the score governor's stateless queries that take one params object (confirmed stateless, Mentat
 * FACTORY_ENGINE_API_MIGRATION_PREP_PLAN slice A): set and score readers, score repair and entry, and the point-by-point
 * and MCP validators. `scoreGovernor` keeps them in 7.x and their engine routes are unchanged. The governor's
 * `parseScoreString` is not among them: `tools.scoring.parseScoreString` is the positional, strict-capable reader whose
 * default answers as the governor's does.
 */
export { calculateMatchStatistics, enrichPointHistory, getQuickStats } from '@Scoring/statistics/standalone';
export { validateSetScore, validateMatchUpScore } from '@Scoring/analysis/validateMatchUpScore';
export { parseScoreString } from '@Scoring/parse/parseScoreStringTool';
export { deduceMatchUpFormat } from '@Helpers/matchUpFormatCode/deduceMatchUpFormat';
export { validateMCPMatch, exportMatchUpJSON } from '@Scoring/replay/mcpValidator';
export { toStatObjects } from '@Scoring/statistics/toStatObjects';
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

// params-object queries, also scoreGovernor
export {
  getMaxSetScore,
  getSetComplement,
  getTiebreakComplement,
} from '@Helpers/matchUpFormatCode/setRules/setComplement';
export { checkSetIsComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
export { keyValueScore } from '@Scoring/entry/keyValueScore/keyValueScore';
export { retainScoreForFormat } from '@Query/matchUp/retainScoreForFormat';
export { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
export { validateScore } from '@Scoring/analysis/validateScore';
export { analyzeScore } from '@Scoring/analysis/analyzeScore';
export { repairScore } from '@Scoring/analysis/repairScore';
export { mcpValidator } from '@Scoring/replay/mcpValidator';
export { pbpValidator } from '@Scoring/replay/pbpValidator';
export { analyzeSet } from '@Query/matchUp/analyzeSet';
