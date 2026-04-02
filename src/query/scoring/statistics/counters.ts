/**
 * Statistics Counter Builder
 *
 * Groups points by category for statistics calculation.
 * Builds the counters structure that matches v3 API format.
 */

import { getDevContext } from '@Global/state/globalState';
import { PointWithMetadata, StatCounters, StatisticsOptions } from './types';
import { categorizePoint } from './pointParser';

/**
 * Build statistics counters from point history
 *
 * Groups points into categories for each team/player:
 * - aces, doubleFaults
 * - winners, unforcedErrors, forcedErrors
 * - pointsWon, pointsServed
 * - servesWon, servesLost, returns
 * - serves1stIn, serves2ndIn, serves1stWon, serves2ndWon
 * - gamesWon
 * - breakpointsFaced, breakpointsSaved
 *
 * @param points - Array of points with metadata
 * @param options - Statistics options (set filter, etc.)
 * @returns Counters grouped by team and category
 */
export function buildCounters(points: PointWithMetadata[], options?: StatisticsOptions): StatCounters {
  const counters: StatCounters = {
    players: {},
    teams: {},
  };

  // Initialize structures
  for (let i = 0; i < 2; i++) {
    counters.players[i] = {};
    counters.teams[i] = {};
  }

  // Filter by set if specified
  let filteredPoints = points;
  if (options?.setFilter !== undefined) {
    filteredPoints = points.filter((p) => p.set === options.setFilter);
  }

  // Process each point
  let lastPoint: PointWithMetadata | undefined;

  filteredPoints.forEach((point, index) => {
    if (point.winner === undefined) {
      if (getDevContext()) console.warn('Point missing winner:', point);
      return;
    }

    const { winner: winnerCategories, loser: loserCategories } = categorizePoint(point);
    const winner = point.winner;
    const loser = (1 - winner) as 0 | 1;

    applyCategories(counters, winner, winnerCategories, point);
    applyCategories(counters, loser, loserCategories, point);
    trackServeStats(counters, point);
    trackHandBreakdown(counters, point, winner, index);
    trackGameCompletion(counters, point, lastPoint);
    trackBreakpoints(counters, point, winner);

    lastPoint = point;
  });

  return counters;
}

function pushToCategory(container, side: number, category: string, item) {
  if (!container[side][category]) container[side][category] = [];
  container[side][category].push(item);
}

function applyCategories(counters: StatCounters, side: number, categories: string[], point: PointWithMetadata) {
  categories.forEach((category) => {
    pushToCategory(counters.teams, side, category, point);
    pushToCategory(counters.players, side, category, point);
  });
}

function trackServeStats(counters: StatCounters, point: PointWithMetadata) {
  if (point.server === undefined) return;
  const server = point.server;
  pushToCategory(counters.teams, server, 'pointsServed', point);

  if (point.serve === 1) {
    pushToCategory(counters.teams, server, 'serves1stIn', point);
  } else if (point.serve === 2) {
    pushToCategory(counters.teams, server, 'serves2ndIn', point);
  }
}

function trackHandBreakdown(counters: StatCounters, point: PointWithMetadata, winner: number, index: number) {
  if (point.hand) {
    pushToCategory(counters.teams, winner, point.hand, { point, index });
  }
}

function trackGameCompletion(
  counters: StatCounters,
  point: PointWithMetadata,
  lastPoint: PointWithMetadata | undefined,
) {
  if (!isGameComplete(point, lastPoint) || lastPoint?.winner === undefined) return;
  const gameWinner = lastPoint.winner;
  pushToCategory(counters.teams, gameWinner, 'gamesWon', lastPoint);
  pushToCategory(counters.players, gameWinner, 'gamesWon', lastPoint);
}

function trackBreakpoints(counters: StatCounters, point: PointWithMetadata, winner: number) {
  if (!point.breakpoint) return;
  const server = point.server!;
  pushToCategory(counters.teams, server, 'breakpointsFaced', point);
  if (winner === server) {
    pushToCategory(counters.teams, server, 'breakpointsSaved', point);
  }
}

function isGameComplete(currentPoint: PointWithMetadata, lastPoint: PointWithMetadata | undefined): boolean {
  if (!lastPoint) return false;

  // If we have explicit game numbers, check if they changed
  if (currentPoint.game !== undefined && lastPoint.game !== undefined) {
    return currentPoint.game !== lastPoint.game;
  }

  // Otherwise, can't determine
  return false;
}

/**
 * Get summary statistics from counters
 *
 * @param counters - Statistics counters
 * @returns Summary with totals and breakdowns
 */
export function getCountersSummary(counters: StatCounters): {
  totalPoints: number;
  byTeam: number[];
  byCategory: Record<string, number>;
} {
  const summary = {
    totalPoints: 0,
    byTeam: [0, 0] as number[],
    byCategory: {} as Record<string, number>,
  };

  // Count points per team
  for (let team = 0; team < 2; team++) {
    if (counters.teams[team].pointsWon) {
      const count = counters.teams[team].pointsWon.length;
      summary.byTeam[team] = count;
      summary.totalPoints += count;
    }
  }

  // Count by category (aggregate both teams)
  const allCategories = new Set<string>();
  for (let team = 0; team < 2; team++) {
    Object.keys(counters.teams[team]).forEach((cat) => allCategories.add(cat));
  }

  allCategories.forEach((category) => {
    summary.byCategory[category] = 0;
    for (let team = 0; team < 2; team++) {
      if (counters.teams[team][category]) {
        summary.byCategory[category] += counters.teams[team][category].length;
      }
    }
  });

  return summary;
}

/**
 * Filter counters to specific set
 *
 * @param counters - Full match counters
 * @param setNumber - Set to filter to (0-based)
 * @returns Counters filtered to set
 */
export function filterCountersBySet(counters: StatCounters, setNumber: number): StatCounters {
  const filtered: StatCounters = {
    players: {},
    teams: {},
  };

  for (let i = 0; i < 2; i++) {
    filtered.players[i] = {};
    filtered.teams[i] = {};
  }

  // Filter each category
  for (let team = 0; team < 2; team++) {
    Object.keys(counters.teams[team]).forEach((category) => {
      const points = counters.teams[team][category];
      const setPoints = points.filter((p) => p.set === setNumber);

      if (setPoints.length > 0) {
        filtered.teams[team][category] = setPoints;
        filtered.players[team][category] = setPoints; // Same for now
      }
    });
  }

  return filtered;
}
