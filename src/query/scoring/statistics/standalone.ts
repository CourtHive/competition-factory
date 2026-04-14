/**
 * Standalone Statistics API
 *
 * Calculate statistics without ScoringEngine or v3 adapter.
 * Can be used with any matchUp and point history.
 */

import { buildCounters, getCountersSummary } from './counters';
import { calculateStats } from './calculator';
import { enrichPoint } from './pointParser';

// types
import { PointWithMetadata, MatchStatistics, StatisticsOptions } from './types';
import { MatchUp } from '@Types/scoring/types';

/**
 * Calculate match statistics from point history
 *
 * This is the main entry point for standalone statistics calculation.
 * Use this when you have a matchUp and point history but aren't using
 * the ScoringEngine or v3 adapter.
 *
 * @param matchUp - Current matchUp state (for context)
 * @param points - Array of points with metadata
 * @param options - Statistics options (set filter, etc.)
 * @returns Complete statistics package
 *
 * @example
 * ```typescript
 * const stats = calculateMatchStatistics(
 *   matchUp,
 *   points,
 *   { setFilter: 0 } // First set only
 * );
 *
 * console.log(stats.calculated); // All calculated stats
 * console.log(stats.counters.teams[0].aces); // Team 0 aces
 * ```
 */
export function calculateMatchStatistics(
  _matchUp: MatchUp,
  points: PointWithMetadata[],
  options?: StatisticsOptions,
): MatchStatistics {
  // Build counters from points (guard against undefined/null)
  const counters = buildCounters(points ?? [], options);

  // Calculate statistics
  const calculated = calculateStats(counters);

  // Get summary
  const summary = getCountersSummary(counters);

  return {
    counters,
    calculated,
    summary,
  };
}

/**
 * Enrich raw point data with match context
 *
 * Takes an array of raw points (e.g., from hive-eye logger) and enriches
 * them with derived fields (server, index, set, game) based on match progression.
 *
 * @param rawPoints - Raw point data
 * @param matchUp - Initial matchUp state
 * @returns Enriched points ready for statistics
 *
 * @example
 * ```typescript
 * const enrichedPoints = enrichPointHistory(
 *   rawPointsFromLogger,
 *   initialMatchUp
 * );
 *
 * const stats = calculateMatchStatistics(
 *   currentMatchUp,
 *   enrichedPoints
 * );
 * ```
 */
export function enrichPointHistory(rawPoints: any[]): PointWithMetadata[] {
  if (!rawPoints) return [];
  const enriched: PointWithMetadata[] = [];

  // Track match state as we process points
  let currentServer = 0;
  let currentSet = 0;
  let currentGame = 0;

  rawPoints.forEach((rawPoint, index) => {
    // Enrich with context
    const enrichedPoint = enrichPoint(rawPoint, {
      server: currentServer as 0 | 1,
      index,
      set: currentSet,
      game: currentGame,
    });

    enriched.push(enrichedPoint);
  });

  return enriched;
}

/**
 * Quick statistics summary
 *
 * Returns just the key statistics without full counter details.
 * Useful for dashboards or quick overviews.
 *
 * @param points - Points with metadata
 * @param options - Statistics options
 * @returns Quick summary object
 *
 * @example
 * ```typescript
 * const summary = getQuickStats(points);
 * console.log(summary.aces);        // [5, 3]
 * console.log(summary.totalPoints); // [45, 39]
 * ```
 */
export function getQuickStats(
  points: PointWithMetadata[],
  options?: StatisticsOptions,
): {
  aces: [number, number];
  doubleFaults: [number, number];
  winners: [number, number];
  unforcedErrors: [number, number];
  totalPoints: [number, number];
} {
  const counters = buildCounters(points ?? [], options);

  return {
    aces: [counters.teams[0].aces?.length || 0, counters.teams[1].aces?.length || 0],
    doubleFaults: [counters.teams[0].doubleFaults?.length || 0, counters.teams[1].doubleFaults?.length || 0],
    winners: [counters.teams[0].winners?.length || 0, counters.teams[1].winners?.length || 0],
    unforcedErrors: [counters.teams[0].unforcedErrors?.length || 0, counters.teams[1].unforcedErrors?.length || 0],
    totalPoints: [counters.teams[0].pointsWon?.length || 0, counters.teams[1].pointsWon?.length || 0],
  };
}
