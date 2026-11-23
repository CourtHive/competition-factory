/**
 * ScoringEngine - the point-by-point scoring engine.
 *
 * A pure reducer over a typed timeline (`v2/`, written from the spec in
 * `documentation/docs/scoring-engine/scoring-engine-spec.md`): the score is a function of the configuration and
 * the timeline, so undo and redo are timeline operations and a saved record replays to the same score.
 *
 * Supports mixed-mode input: points, games, sets, and segments can all be added and undone/redone through a
 * unified timeline.
 *
 * Usage:
 *   const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
 *   engine.addPoint({ winner: 0 });
 *   engine.addPoint({ winner: 1 });
 *   engine.undo();
 *   const matchUp = engine.getState();
 */

import type { PointMultiplier } from '@Scoring/v1/resolvePointValue';
import type { getScore } from '@Scoring/v1/getScore';
import type {
  SubstitutionViolation,
  SubstitutionResult,
  SubstitutionRules,
  SubstitutionError,
  TeamCompetitor,
  ScoreEntry,
  MatchUp,
} from '@Types/scoring/types';

// competitionFormat types (mirrored from factory for standalone use)

// the substitution contract lives in contracts, where the scoring kernel reads it too
export type { SubstitutionError, SubstitutionResult, SubstitutionRules, SubstitutionViolation };
export interface TimerProfile {
  shotClockSeconds?: number;
  segmentTimers?: { segmentType: string; minutes: number; direction?: string; stoppageTime?: boolean }[];
  changeoverSeconds?: number;
  setBreakSeconds?: number;
}
export interface TimeoutRules {
  count: number;
  per: string; // 'MATCHUP' | 'SET' | 'HALF' | 'SEGMENT'
  durationSeconds?: number;
  maxPerSide?: number;
}
export interface PenaltyBoxProfile {
  durationSeconds: number;
}

export interface PlayerRules {
  maxMinutesPerSegment?: number;
  matchUpTypes?: string[];
}
export interface PenaltyProfile {
  sport?: string;
  penaltyTypes: { penaltyType: string; label: string; category?: string }[];
  escalation?: { step: number; consequence: string }[];
}
export interface PointProfile {
  sport?: string;
  pointResults: { result: string; label: string; isError?: boolean; isServe?: boolean }[];
  strokeTypes?: string[];
  serveLocations?: string[];
}

export type ServerRule = 'ALTERNATE_GAMES' | 'WINNER_SERVES';

export interface CompetitionFormat {
  competitionFormatId?: string;
  competitionFormatName?: string;
  matchUpFormat?: string;
  sport?: string;
  timerProfile?: TimerProfile;
  timeoutRules?: TimeoutRules;
  substitutionRules?: SubstitutionRules;
  playerRules?: PlayerRules;
  penaltyProfile?: PenaltyProfile;
  penaltyBoxProfile?: PenaltyBoxProfile;
  pointProfile?: PointProfile;
  pointMultipliers?: PointMultiplier[];
  /** Server determination rule: 'ALTERNATE_GAMES' (default) or 'WINNER_SERVES' */
  serverRule?: ServerRule;
  notes?: string;
}

/**
 * Event handler context passed to all callbacks
 */
export interface ScoringEventContext {
  /** Current matchUp state */
  state: MatchUp;
  /** Current score result */
  score: ReturnType<typeof getScore>;
}

/**
 * Optional event handlers fired during engine state changes
 *
 * All handlers receive the current engine context after the action completes.
 * Handlers are called synchronously — keep them fast or dispatch async work.
 */
export interface ScoringEventHandlers {
  /** Fired after a point is added */
  onPoint?: (context: ScoringEventContext) => void;
  /** Fired after undo */
  onUndo?: (context: ScoringEventContext) => void;
  /** Fired after redo */
  onRedo?: (context: ScoringEventContext) => void;
  /** Fired after reset */
  onReset?: (context: ScoringEventContext) => void;
  /** Fired when a game completes (within addPoint) */
  onGameComplete?: (context: ScoringEventContext & { gameWinner: 0 | 1 }) => void;
  /** Fired when a set completes (within addPoint) */
  onSetComplete?: (context: ScoringEventContext & { setWinner: 0 | 1 }) => void;
  /** A combined-point segment completed without a winner. */
  onMatchTie?: (context: ScoringEventContext) => void;
  /** Fired when the match completes with a winner. */
  onMatchComplete?: (context: ScoringEventContext & { matchWinner: 0 | 1 }) => void;
}

export interface ScoringEngineOptions {
  competitionFormat?: CompetitionFormat;
  pointMultipliers?: PointMultiplier[];
  eventHandlers?: ScoringEventHandlers;
  matchUpFormat?: string;
  isDoubles?: boolean;
  matchUpId?: string;
}

export interface ScoringEngineSupplementaryState {
  /** Envelope version: 1 adds the scoring configuration. An envelope without it predates the field. */
  version?: number;
  initialLineUps?: Record<string, TeamCompetitor[]>;
  redoStack?: ScoreEntry[];
  /** The configuration the history was scored under; a load restores it, over the constructor's. */
  competitionFormat?: CompetitionFormat;
  pointMultipliers?: PointMultiplier[];
}

export { ScoringEngine } from './v2/engine';
