/**
 * Statistics Module
 *
 * Provides statistics tracking and calculation.
 * Can be used standalone or via ScoringEngine.getStatistics().
 *
 * @example Standalone usage
 * ```typescript
 * import { calculateMatchStatistics } from './standalone';
 *
 * const stats = calculateMatchStatistics(matchUp, points);
 * console.log(stats.calculated); // Array of all statistics
 * ```
 *
 * @example With ScoringEngine
 * ```typescript
 * const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
 * engine.addPoint({ winner: 0, result: 'Ace' });
 * const stats = engine.getStatistics();
 * ```
 */

export * from './types';
export * from './pointParser';
export * from './counters';
export * from './calculator';
export * from './standalone';
export * from './toStatObjects';
