/**
 * Statistics Types
 *
 * Type definitions for UMO v4 statistics tracking and calculation.
 * Based on v3 statistics API with enhancements.
 */

/**
 * Point with full metadata for statistics tracking
 *
 * NOTE: Based on real hive-eye data analysis:
 * - winner is NOT always present (code-only points like aces)
 * - server must be derived from match state
 * - rally is a NUMBER (length), not array
 * - stroke/hand fields NOT currently captured by UI
 */
export interface PointWithMetadata {
  // Core identifiers (some derived during processing)
  winner?: 0 | 1; // May be missing on code-only points
  server?: 0 | 1; // Derived from match state
  index?: number; // Added during processing
  set?: number; // Added during processing
  game?: number; // Added during processing

  // Point outcome (how the point ended)
  result?:
    'Ace' | 'Winner' | 'Serve Winner' | 'Unforced Error' | 'Forced Error' | 'Double Fault' | 'Net' | 'Out' | 'Penalty';

  // Stroke type (final shot)
  stroke?:
    | 'Forehand'
    | 'Backhand'
    | 'Volley'
    | 'Forehand Volley'
    | 'Backhand Volley'
    | 'Overhead'
    | 'Smash'
    | 'Drop Shot'
    | 'Lob'
    | 'Slice';

  // Hand used for final shot
  hand?: 'Forehand' | 'Backhand' | 'Right' | 'Left';

  // Serve information
  serve?: 1 | 2; // 1st or 2nd serve

  // Court position/location
  location?: string; // 'Wide', 'Body', 'T', or custom

  // Rally information (from hive-eye: rally is a NUMBER)
  rally?: number; // Rally length (number of shots)

  // First serve information (present on 2nd serve after fault)
  first_serve?: {
    error: string;
    serves: string[];
  };

  // Context flags
  breakpoint?: boolean;
  gamepoint?: boolean;
  setpoint?: boolean;
  matchpoint?: boolean;
  tiebreak?: boolean;

  // UMO point code (for compatibility)
  code?: string; // 'S', 'R', 'D', etc.

  // Timestamp
  timestamp?: number;

  // Additional metadata (extensible)
  [key: string]: any;
}

/**
 * Statistics counters - episodes grouped by category
 */
export interface StatCounters {
  players: Record<number, Record<string, PointWithMetadata[]>>;
  teams: Record<number, Record<string, PointWithMetadata[]>>;
}

/**
 * Calculated statistic result
 */
export interface CalculatedStat {
  category: string;
  teams: StatTeamValue[];
}

/**
 * Stat value for one team/player
 */
export interface StatTeamValue {
  value: number;
  display: string;
  numerators?: string[];
}

/**
 * Statistics configuration options
 */
export interface StatisticsOptions {
  setFilter?: number; // Filter to specific set (0-based) or undefined for all
  playerFilter?: number; // Filter to specific player or undefined for both
  includeStrokeBreakdown?: boolean; // Include forehand/backhand breakdown
  includeRallyStats?: boolean; // Include rally length stats
}

/**
 * Stat calculation definition
 */
export interface StatDefinition {
  category: string;
  numerators: string[];
  denominators?: string[];
  calc: 'number' | 'percentage' | 'maxConsecutive' | 'difference' | 'aggressiveMargin';
  attribute?: string; // For maxConsecutive calculations
}

/**
 * Complete statistics result
 */
export interface MatchStatistics {
  counters: StatCounters;
  calculated: CalculatedStat[];
  summary?: {
    totalPoints: number;
    bySet?: number[];
    byPlayer?: number[];
  };
}

/**
 * Display-ready statistic for visualization components.
 *
 * Each StatObject represents one row in a statistics display,
 * with values for both sides (team 0 and team 1).
 */
export interface StatObject {
  name: string;
  numerator: [number, number];
  denominator?: [number, number];
  pct?: [number, number];
  default?: 'numerator';
}
