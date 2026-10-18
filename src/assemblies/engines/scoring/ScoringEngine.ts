/**
 * ScoringEngine - Mutation engine for point-by-point scoring
 *
 * Manages internal matchUp state with native undo/redo support.
 * Follows tods-competition-factory pattern (governors/engines).
 *
 * Supports mixed-mode input: points, games, sets, and segments
 * can all be added and undone/redone through a unified timeline.
 *
 * Usage:
 *   const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
 *   engine.addPoint({ winner: 0 });
 *   engine.addPoint({ winner: 1 });
 *   engine.undo();
 *   const matchUp = engine.getState();
 */

import {
  inputLevels,
  resolveSetType,
  tiebreakMargin,
  inputLevelError,
  isLiveDecidingSet,
} from '@Tools/scoring/scoringUtilities';
import { finalSetGoverns, openSetNumber } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { calculateMatchStatistics } from '@Query/scoring/statistics/standalone';
import { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
import { isDecisionRequired } from '@Query/scoring/decisionRequired';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { getScoreboard } from '@Query/scoring/getScoreboard';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { getEpisodes } from '@Query/scoring/getEpisodes';
import { isComplete } from '@Query/scoring/isComplete';
import { getWinner } from '@Query/scoring/getWinner';
import { getScore } from '@Query/scoring/getScore';
import { nowIso } from '@Tools/clock';
import {
  addPoint,
  validatePointInput,
  deriveServer,
  deriveServerBase,
  checkStandardSetWon,
} from '@Mutate/scoring/addPoint';
import {
  replayAsV1,
  scoresAfter,
  checkAndFinalizeMatch,
  SCORING_PAST_LEVEL_CLOSE,
} from '@Mutate/scoring/matchCompletion';

// constants and types
import type { MatchStatistics, StatisticsOptions, StatObject } from '@Query/scoring/statistics/types';
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { PointMultiplier } from '@Mutate/scoring/resolvePointValue';
import type { InputLevels } from '@Tools/scoring/scoringUtilities';
import type {
  MatchUp,
  AddPointOptions,
  AddSetOptions,
  AddGameOptions,
  ScoreEntry,
  EndSegmentOptions,
  InitialScoreOptions,
  SetScore,
  TeamCompetitor,
  SubstitutionEvent,
  FormatStructure,
  Point,
  Episode,
} from '@Types/scoring/types';

// competitionFormat types (mirrored from factory for standalone use)
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
/**
 * A competition's substitution rules. Advisory (CA 2026-10-17): the engine reports what a substitution
 * would break through evaluateSubstitution(), and the host decides; substitute() refuses only a
 * substitution that would corrupt who is on court. A required substitution (a player out of time, a
 * penalty removal) is the host's to allow.
 */
export interface SubstitutionRules {
  allowed: boolean;
  maxPerMatchUp?: number; // Omit = unlimited; 0 = none despite allowed: true
  maxPerSegment?: number;
  allowedMatchUpTypes?: string[];
  timing?: string; // 'BETWEEN_GAMES' | 'BETWEEN_POINTS' | 'ANY'
  minRosterSize?: number;
  maxRosterSize?: number;
}
/** Why substitute() refused: each would leave the lineUp naming the wrong players. */
export type SubstitutionError = 'NO_LINEUP' | 'OUT_NOT_ON_SIDE' | 'IN_ALREADY_ON_COURT' | 'SAME_PARTICIPANT';
export type SubstitutionResult = { success: true } | { success: false; error: SubstitutionError };
/** A competition substitution rule a substitution made now would break. */
export type SubstitutionViolation = 'NOT_ALLOWED' | 'MAX_PER_MATCHUP' | 'MAX_PER_SEGMENT' | 'TIMING' | 'MATCHUP_TYPE';

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

const SUPPLEMENTARY_STATE_VERSION = 1;

/**
 * Point fields the scorer calculates. A replay recomputes them, so they are never replay input; every
 * other field on a point is something a caller recorded.
 */
const CALCULATED_POINT_FIELDS = new Set([
  'pointNumber',
  'winningSide',
  'serverSideNumber',
  'index',
  'set',
  'game',
  'number',
  'score',
  'pointsToGame',
  'pointsToSet',
  'pointsToMatch',
  'gamesToSet',
  'isBreakpoint',
  'serveSide',
]);

/** The 1-indexed spellings of winner and server: calculated on every point, and a caller's input when supplied. */
const INPUT_SPELLINGS = new Set(['winningSide', 'serverSideNumber']);

/**
 * A caller's point input as the timeline records it: every field it supplied, and nothing calculated. A
 * calculated field passed in (an untyped `serveSide`, say) is overwritten by the scorer, so recording it
 * would leave the entry and the point disagreeing.
 */
function recordedPointInput(options: AddPointOptions): AddPointOptions {
  return Object.fromEntries(
    Object.entries(options).filter(
      ([key, value]) => value !== undefined && (INPUT_SPELLINGS.has(key) || !CALCULATED_POINT_FIELDS.has(key)),
    ),
  ) as AddPointOptions;
}

/**
 * Replay input for a point with no timeline entry (a record saved without one): every field but the
 * calculated ones. Its scoreValue is the effective value it was scored with, so the old result stands.
 */
function pointReplayInput(point: Point): AddPointOptions {
  return Object.fromEntries(
    Object.entries(point).filter(([key, value]) => value !== undefined && !CALCULATED_POINT_FIELDS.has(key)),
  ) as AddPointOptions;
}

/**
 * The lineUps a matchUp started from: its current lineUps with every substitution on its timeline
 * undone, last first. Undefined when neither side has a lineUp.
 */
function deriveInitialLineUps(matchUp: MatchUp): Record<number, TeamCompetitor[]> | undefined {
  const sides = (matchUp.sides ?? []).filter((side) => side.lineUp?.length);
  if (!sides.length) return undefined;

  const lineUps: Record<number, TeamCompetitor[]> = {};
  for (const side of sides) lineUps[side.sideNumber!] = side.lineUp!.map((tc) => ({ ...tc }));

  const entries = matchUp.history?.entries;
  const substitutions: SubstitutionEvent[] = entries
    ? entries.filter((e) => e.type === 'substitution').map((e) => e.data)
    : (matchUp.history?.substitutions ?? []);

  for (const sub of [...substitutions].reverse()) {
    const lineUp = lineUps[sub.sideNumber];
    const index = lineUp?.findIndex((tc) => tc.participantId === sub.inParticipantId) ?? -1;
    if (index !== -1) lineUp[index] = { ...lineUp[index], participantId: sub.outParticipantId };
  }

  return lineUps;
}

/**
 * ScoringEngine - Stateful engine for multi-level scoring
 *
 * Holds internal matchUp state and provides mutation operations.
 * Supports undo/redo across all input modes (points, games, sets, segments).
 * Supports competitionFormat consumption for gameplay rules.
 */
export class ScoringEngine {
  private competitionFormat?: CompetitionFormat;
  private initialLineUps?: Record<number, TeamCompetitor[]>;
  private pointMultipliers: PointMultiplier[] = [];
  private cachedFormatStructure?: FormatStructure;
  private eventHandlers?: ScoringEventHandlers;
  private initialScore?: InitialScoreOptions; // For late arrival
  private redoStack: ScoreEntry[] = [];
  // the legacy shapes the last rebuild met (spec § 12.8)
  private legacyShapes = new Set<string>();
  private matchUpFormat: string;
  private matchUpId?: string;
  private isDoubles: boolean;
  private state!: MatchUp; // Definite assignment - initialized in constructor

  /**
   * Create new ScoringEngine
   *
   * @param options - Engine configuration
   */
  constructor(options: ScoringEngineOptions = {}) {
    // Extract from competitionFormat if provided
    if (options.competitionFormat) {
      this.competitionFormat = options.competitionFormat;
      this.matchUpFormat = options.matchUpFormat || options.competitionFormat.matchUpFormat || 'SET3-S:6/TB7';
      this.pointMultipliers = options.pointMultipliers ?? options.competitionFormat.pointMultipliers ?? [];
    } else {
      this.matchUpFormat = options.matchUpFormat || 'SET3-S:6/TB7';
      this.pointMultipliers = options.pointMultipliers ?? [];
    }

    this.matchUpId = options.matchUpId;
    this.isDoubles = options.isDoubles || false;
    this.eventHandlers = options.eventHandlers;

    this.state = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: this.matchUpId,
      isDoubles: this.isDoubles,
    });

    // Cache parsed format structure
    this.cacheFormatStructure();
  }

  /**
   * Load matchUp state from JSON
   *
   * @param matchUp - TODS matchUp object
   */
  setState(matchUp: MatchUp): void {
    // a copy: the caller's object stays the caller's (S9); a JSON round trip, as in getState
    // eslint-disable-next-line no-restricted-syntax
    this.state = JSON.parse(JSON.stringify(matchUp));
    this.matchUpFormat = matchUp.matchUpFormat;
    this.matchUpId = matchUp.matchUpId;
    this.isDoubles = matchUp.matchUpType === 'DOUBLES';
    this.redoStack = [];
    this.initialScore = undefined;
    // A rebuild starts the lineUps from their initial snapshot. Loaded without one (no
    // loadSupplementaryState to follow), the snapshot is the loaded lineUps with the substitution
    // timeline undone; never a previous matchUp's.
    this.initialLineUps = deriveInitialLineUps(matchUp);
    this.cacheFormatStructure();
  }

  /**
   * Get current matchUp state as JSON
   *
   * @returns Deep copy of the TODS matchUp object (safe from external mutation).
   * Uses JSON round-trip instead of structuredClone because the state may contain
   * framework proxy wrappers (e.g. Svelte 5 $state) that structuredClone rejects.
   */
  getState(): MatchUp {
    // Deliberate — see the JSDoc above. structuredClone throws DataCloneError on the framework proxies
    // this state can hold, so the JSON round-trip is the requirement here, not the default deep-copy
    // idiom the rule exists to retire.
    // eslint-disable-next-line no-restricted-syntax
    return JSON.parse(JSON.stringify(this.state));
  }

  // ===========================================================================
  // Input Methods
  // ===========================================================================

  /**
   * Add a point to the match
   *
   * @param options - Point options (winner, server, etc.)
   */
  addPoint(options: AddPointOptions): void {
    // refused before anything is written: an unscorable format or an invalid input (S9), or a segment
    // of outs, which takes set totals (S4)
    if (!this.cachedFormatStructure) throw new Error(`Invalid matchUpFormat: ${this.matchUpFormat}`);
    validatePointInput(options);
    if (!this.getInputLevels().point) throw inputLevelError('point');
    // before the point is scored: a record without a timeline starts one from the points it already has
    this.ensureHistory();
    const pointIndex = this.state.history?.points.length || 0;

    // Snapshot game/set/match state before point for event detection
    const prevTotalGames = this.state.score.sets.reduce((sum, s) => sum + (s.side1Score || 0) + (s.side2Score || 0), 0);
    const prevCompletedSets = this.state.score.sets.filter((s) => s.winningSide !== undefined).length;
    const prevComplete = this.state.matchUpStatus === COMPLETED;

    // Decorate active players from lineUp before adding point
    const activePlayers = this.activePlayersForPoint();

    // Add point using pure function with multiplier config
    this.state = addPoint(this.state, this.scoredPointInput(options), {
      pointMultipliers: this.pointMultipliers,
    });

    // The pure function ignores a point it cannot score — one after the match is COMPLETED, or one
    // naming no winner — and returns the matchUp unchanged. Nothing was played, so nothing is
    // recorded: no timeline entry (undo would pop it as a phantom), no cleared redo stack, no
    // onPoint, and no activePlayers or penaltyType stamped onto the point before it. A correction to
    // a point already played goes through decoratePoint or editPoint, which a completed match takes.
    if ((this.state.history?.points.length || 0) === pointIndex) return;

    // Attach activePlayers to the just-added point
    if (activePlayers) {
      const lastPoint = this.state.history!.points[this.state.history!.points.length - 1];
      lastPoint.activePlayers = activePlayers;
    }

    // Attach penaltyType to the point if provided
    if (options.penaltyType) {
      const lastPoint = this.state.history!.points[this.state.history!.points.length - 1];
      (lastPoint as any).penaltyType = options.penaltyType;
    }

    // Record entry in unified timeline: every input the caller supplied (S1). A calculated server is
    // not one, so a rebuild re-derives it.
    this.state.history!.entries ??= [];
    this.state.history!.entries.push({
      type: 'point',
      data: recordedPointInput(options),
      timestamp: options.timestamp || nowIso(),
      pointIndex,
    });

    // Clear redo stack (new branch - can't redo after new action)
    this.redoStack = [];

    // Fire event handlers
    if (this.eventHandlers) {
      const ctx = this.buildEventContext();

      this.eventHandlers.onPoint?.(ctx);

      // Detect game completion (total games across all sets increased)
      const curTotalGames = this.state.score.sets.reduce(
        (sum, s) => sum + (s.side1Score || 0) + (s.side2Score || 0),
        0,
      );
      if (curTotalGames > prevTotalGames && !this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
        // the side that won the deciding point, whichever spelling the caller used (S11)
        const gameWinner = this.state.history!.points.at(-1)!.winner;
        this.eventHandlers.onGameComplete?.({ ...ctx, gameWinner });
      }

      // Detect set completion (number of sets with winningSide increased)
      const curCompletedSets = this.state.score.sets.filter((s) => s.winningSide !== undefined).length;
      if (curCompletedSets > prevCompletedSets) {
        const completedSet = this.state.score.sets.findLast((s) => s.winningSide !== undefined);
        const setWinner = completedSet?.winningSide === 1 ? 0 : 1;
        this.eventHandlers.onSetComplete?.({ ...ctx, setWinner });
      }

      // Detect match completion
      if (!prevComplete && this.state.matchUpStatus === COMPLETED) {
        this.notifyMatchComplete(ctx);
      }
    }
  }

  /**
   * A match that ended level with no declared decider (§ 9.7, CA 2026-10-18): it takes no game, set
   * total or segment end, which would play a segment the format did not declare, and records nothing.
   * A combined total keeps its own refusals.
   */
  private endedLevel(): boolean {
    return !this.cachedFormatStructure?.setFormat?.combinedPointTotal && isDecisionRequired(this.state);
  }

  /** The game, set or segment-end action that ends a match level fires onMatchTie (§ 11.5). */
  private notifyLevelClose(): void {
    if (isDecisionRequired(this.state)) this.eventHandlers?.onMatchTie?.(this.buildEventContext());
  }

  /**
   * The legacy shapes the last rebuild met (spec § 12.8): `scoringPastLevelClose` when a stored timeline
   * scored past a level close, as v1 did, and was replayed as v1 replayed it.
   */
  getLegacyShapes(): string[] {
    return [...this.legacyShapes];
  }

  /** After a replayed entry: a timeline v1 wrote past a level close replays as v1 (§ 12.8). */
  private replayLegacyShape(matchUp: MatchUp, wasComplete: boolean, scoresLater: boolean): void {
    const legacy = this.legacyShapes.has(SCORING_PAST_LEVEL_CLOSE);
    const formatStructure = this.cachedFormatStructure;
    if (replayAsV1({ matchUp, formatStructure, wasComplete, scoresLater, legacy }))
      this.legacyShapes.add(SCORING_PAST_LEVEL_CLOSE);
  }

  private notifyMatchComplete(ctx: ScoringEventContext): void {
    if (this.state.winningSide === undefined) this.eventHandlers?.onMatchTie?.(ctx);
    else this.eventHandlers?.onMatchComplete?.({ ...ctx, matchWinner: this.state.winningSide === 1 ? 0 : 1 });
  }

  /**
   * Add a complete set score (set-level input)
   *
   * Used by scoring modals where users enter finished set scores directly.
   * Does not validate the total against the format: when winningSide is not provided it is
   * inferred from any unequal total (a level total leaves the set open). Then checks match
   * completion and records a ScoreEntry in history. The spec's rule (scoring-engine-spec § 2.3)
   * judges the total by its segment's rule; v1 does not yet.
   *
   * @param options - Set score data
   */
  addSet(options: AddSetOptions): void {
    // a match that ended level plays no segment the format did not declare (§ 9.7)
    if (this.endedLevel()) return;
    this.applyAddSet(options);

    // Record entry in unified timeline
    this.ensureHistory();
    const winningSide = this.state.score.sets.at(-1)?.winningSide;
    this.state.history!.entries!.push({
      type: 'set',
      data: { ...options, winningSide },
      timestamp: options.timestamp || nowIso(),
    });

    this.redoStack = [];
    this.notifyLevelClose();
  }

  /**
   * Add a game result (game-level input)
   *
   * For scenarios where game-by-game tracking is needed without point detail.
   * Creates a new set if needed, increments game scores, checks set/match
   * completion, and records a ScoreEntry in history.
   *
   * @param options - Game result data
   */
  addGame(options: AddGameOptions): void {
    this.requireGameOrTimedSegment();
    if (!this.getInputLevels().game) throw inputLevelError('game');
    if (this.endedLevel()) return;
    this.applyAddGame(options);

    // Record entry in unified timeline
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'game',
      data: options,
      timestamp: options.timestamp || nowIso(),
    });

    this.redoStack = [];
    this.notifyLevelClose();
  }

  /**
   * End a timed segment/period
   *
   * For timed formats (S:T10P, HAL2A-S:T45, etc.), this finalizes
   * the current set's score and checks match completion.
   *
   * @param options - Segment options
   */
  endSegment(options?: EndSegmentOptions): void {
    this.requireGameOrTimedSegment();
    if (this.endedLevel()) return;
    this.applyEndSegment(options);

    // Record entry in unified timeline
    this.ensureHistory();
    const currentSetIndex = (options?.setNumber ?? this.state.score.sets.length) - 1;
    this.state.history!.entries!.push({
      type: 'endSegment',
      data: { setNumber: currentSetIndex + 1, ...options },
      timestamp: options?.timestamp || nowIso(),
    });
    this.notifyLevelClose();
  }

  /**
   * Set the initial score before beginning point-by-point tracking
   *
   * Used when a tracker arrives mid-match and wants to set the current
   * score before beginning to track points.
   *
   * @param options - Initial score state
   */
  setInitialScore(options: InitialScoreOptions): void {
    if (this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
      const sets = options.sets.map((set, index) => ({ ...set, setNumber: index + 1 }));
      if (options.currentGameScore) throw new Error('Combined-point formats have no game score');
      if (options.currentSetScore) sets.push({ ...options.currentSetScore, setNumber: sets.length + 1 });
      this.validateCombinedScore(sets);
    }
    this.initialScore = options;
    this.redoStack = [];

    // Apply initial score to state
    this.applyInitialScore(this.state, options);

    // Record entry in unified timeline
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'setInitialScore',
      data: options,
      timestamp: nowIso(),
    });

    // Mark as in-progress
    if (this.state.matchUpStatus === TO_BE_PLAYED) {
      this.state.matchUpStatus = IN_PROGRESS;
    }
  }

  // ===========================================================================
  // Undo / Redo
  // ===========================================================================

  /**
   * Undo last N actions
   *
   * In mixed-mode, undoes the last entry regardless of type (point, game, set, segment).
   * Falls back to point-only undo for legacy states without entries.
   *
   * @param count - Number of actions to undo (default: 1)
   * @returns True if undo succeeded, false if nothing to undo
   */
  undo(count: number = 1): boolean {
    const entries = this.state.history?.entries;

    // Entries-based undo (mixed-mode)
    if (entries && entries.length > 0) {
      const toUndo = Math.min(count, entries.length);
      for (let i = 0; i < toUndo; i++) {
        const entry = entries.pop()!;
        this.redoStack.push(entry);

        // Also remove from points array for point entries
        if (entry.type === 'point') {
          this.state.history!.points.pop();
        }
      }
      this.rebuildFromEntries();

      this.eventHandlers?.onUndo?.(this.buildEventContext());
      return true;
    }

    // Legacy fallback: no entries, just points
    const points = this.state.history?.points ?? [];
    if (points.length === 0) return false;

    const pointsToUndo = Math.min(count, points.length);
    for (let i = 0; i < pointsToUndo; i++) {
      const point = points.pop()!;
      this.redoStack.push({ type: 'point', data: pointReplayInput(point), timestamp: point.timestamp || '' });
    }
    this.rebuildState();

    this.eventHandlers?.onUndo?.(this.buildEventContext());
    return true;
  }

  /**
   * Redo last N undone actions
   *
   * Re-applies actions from the redo stack.
   *
   * @param count - Number of actions to redo (default: 1)
   * @returns True if redo succeeded, false if nothing to redo
   */
  redo(count: number = 1): boolean {
    if (this.redoStack.length === 0) return false;

    // A record with no timeline was undone point by point: put the points back the same way. Starting
    // a timeline here would hold only the redone points, and a rebuild from it would drop the rest.
    if (!this.state.history?.entries) {
      const toRedo = Math.min(count, this.redoStack.length);
      for (let i = 0; i < toRedo; i++) {
        const entry = this.redoStack.pop()!;
        this.state = addPoint(this.state, entry.data, { pointMultipliers: this.pointMultipliers });
      }
      this.eventHandlers?.onRedo?.(this.buildEventContext());
      return true;
    }

    const toRedo = Math.min(count, this.redoStack.length);
    for (let i = 0; i < toRedo; i++) {
      // a redone point is re-added during the rebuild
      this.state.history!.entries!.push(this.redoStack.pop()!);
    }

    this.rebuildFromEntries();

    this.eventHandlers?.onRedo?.(this.buildEventContext());
    return true;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    const entries = this.state.history?.entries;
    if (entries && entries.length > 0) return true;
    return (this.state.history?.points.length || 0) > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get undo depth (number of actions that can be undone)
   */
  getUndoDepth(): number {
    const entries = this.state.history?.entries;
    if (entries && entries.length > 0) return entries.length;
    return this.state.history?.points.length || 0;
  }

  /**
   * Get redo depth (number of actions that can be redone)
   */
  getRedoDepth(): number {
    return this.redoStack.length;
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get current score
   */
  getScore(): ReturnType<typeof getScore> {
    // a copy: the score's sets are the engine's own (S9)
    // eslint-disable-next-line no-restricted-syntax
    return JSON.parse(JSON.stringify(getScore(this.state)));
  }

  /**
   * Get scoreboard display string
   */
  getScoreboard(options?: Parameters<typeof getScoreboard>[1]): string {
    return getScoreboard(this.state, options);
  }

  /**
   * Get match winner
   * @returns Winning side number (1 or 2), or undefined if not complete
   */
  getWinner(): number | undefined {
    return getWinner(this.state);
  }

  /**
   * Check if match is complete
   */
  isComplete(): boolean {
    return isComplete(this.state);
  }

  /**
   * Get number of points played
   */
  getPointCount(): number {
    return this.state.history?.points.length || 0;
  }

  /**
   * Get match format
   */
  getFormat(): string {
    return this.state.matchUpFormat;
  }

  // ===========================================================================
  // Statistics, Introspection & Analysis
  // ===========================================================================

  /**
   * Get match statistics calculated from point history
   *
   * @param options - Statistics options (set filter, etc.)
   * @returns Complete statistics package with counters, calculated stats, and summary
   */
  getStatistics(options?: StatisticsOptions): MatchStatistics {
    const points = this.state.history?.points ?? [];
    return calculateMatchStatistics(this.state, points as any[], options);
  }

  /**
   * Get display-ready statistics as StatObject array
   *
   * Convenience method that calls getStatistics() and transforms the result
   * into StatObject[] format for visualization components (e.g., statView).
   *
   * @param options - Statistics options (set filter, etc.)
   * @returns StatObject[] for display consumption
   */
  getStatObjects(options?: StatisticsOptions): StatObject[] {
    return toStatObjects(this.getStatistics(options));
  }

  /**
   * Get who serves the next point
   *
   * Uses format-driven server alternation (default) or competition format
   * server rule (e.g., WINNER_SERVES where last point winner serves).
   *
   * @returns 0 = side 1 serves, 1 = side 2 serves
   */
  getNextServer(): 0 | 1 {
    const serverRule = this.competitionFormat?.serverRule;

    if (serverRule === 'WINNER_SERVES') {
      const lastPoint = this.state.history?.points.at(-1);
      return lastPoint ? lastPoint.winner : 0;
    }

    // Default: format-driven server alternation
    if (!this.cachedFormatStructure) return 0;

    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const setType = resolveSetType(this.cachedFormatStructure, setsWon, openSetNumber(this.state.score.sets));

    return deriveServer(this.state, this.cachedFormatStructure, setType);
  }

  /**
   * Set who should serve the next point
   *
   * Use this to correct server tracking when players lose track of who
   * should be serving, or to set the initial server at the start of a match.
   * The correction applies from this point forward — points already recorded
   * retain their original server values. Records a timeline entry so the
   * change survives undo/redo.
   *
   * @param side - Who should serve the next point (0 = side 1, 1 = side 2)
   */
  setServer(side: 0 | 1, options?: { recordEntry?: boolean }): void {
    if (!this.cachedFormatStructure) return;

    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const setType = resolveSetType(this.cachedFormatStructure, setsWon, openSetNumber(this.state.score.sets));

    // Compare desired server against the base derivation (which assumes
    // side 0 served game 0). If they disagree, flip is needed.
    const baseServer = deriveServerBase(this.state, this.cachedFormatStructure, setType);
    this.state.serverFlip = side !== baseServer;

    // Skip entry recording for derived server changes (e.g. INTENNSE post-point
    // serving rules) so undo operates on user actions, not auto-derived state.
    if (options?.recordEntry === false) return;

    // Record in timeline for undo/redo — store the desired side so
    // rebuild can recompute the flip at the correct position
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'setServer',
      data: { side },
      timestamp: nowIso(),
    });

    // Clear redo stack (new branch)
    this.redoStack = [];
  }

  /**
   * Get episodes — point history enriched with game/set/match context
   *
   * Each episode contains the point data plus game boundaries, set boundaries,
   * points needed at each level, and next server information. Suitable for
   * timeline visualization and detailed analysis.
   *
   * @returns Array of episodes, one per point
   */
  getEpisodes(): Episode[] {
    return getEpisodes(this.state);
  }

  /**
   * Whether the format uses No-Advantage scoring (deciding point at deuce)
   */
  isNoAd(): boolean {
    return !!(this.cachedFormatStructure?.setFormat?.NoAD || this.cachedFormatStructure?.setFormat?.gameFormat?.NoAD);
  }

  /**
   * Number of sets needed to win the match
   */
  getSetsToWin(): number {
    if (!this.cachedFormatStructure) return 2;
    const bestOf = this.cachedFormatStructure.exactly || this.cachedFormatStructure.bestOf || 3;
    return Math.ceil(bestOf / 2);
  }

  /**
   * Game count at which a tiebreak is played, or null if no tiebreak
   *
   * For tiebreak-only formats (pickleball, etc.), returns null since
   * the entire set IS the tiebreak.
   */
  getTiebreakAt(): number | null {
    const sf = this.cachedFormatStructure?.setFormat;
    if (!sf) return null;

    // Tiebreak-only sets don't have a tiebreakAt threshold
    if (sf.tiebreakSet) return null;

    // Timed sets don't have tiebreaks
    if (sf.timed) return null;

    // No tiebreak explicitly configured
    if (sf.noTiebreak) return null;

    // Default: tiebreakAt = setTo (e.g., 6 for standard tennis)
    const setTo = sf.setTo || 6;
    return (typeof sf.tiebreakAt === 'number' ? sf.tiebreakAt : undefined) ?? setTo;
  }

  /**
   * Whether a tiebreak is played in the final/deciding set
   */
  hasFinalSetTiebreak(): boolean {
    const ff = this.cachedFormatStructure?.finalSetFormat;
    if (!ff) {
      // No separate final set format — use regular set format rules
      return this.getTiebreakAt() !== null;
    }

    // Final set is a match tiebreak
    if (ff.tiebreakSet) return true;

    // Final set has no tiebreak (advantage set)
    if (ff.noTiebreak) return false;

    // Final set has standard tiebreak
    return !!(ff.tiebreakFormat ?? ff.tiebreakAt !== undefined);
  }

  /**
   * Get the parsed format structure (for advanced consumers)
   *
   * @returns The parsed FormatStructure or undefined if format is invalid
   */
  getFormatStructure(): FormatStructure | undefined {
    return this.cachedFormatStructure;
  }

  /**
   * The inputs the set in play can be scored with: points, games, or set totals (addSet). A segment of
   * outs takes set totals only; addPoint and addGame refuse what this reports as unavailable.
   */
  getInputLevels(): InputLevels {
    return inputLevels(this.activeSetFormat());
  }

  /** The format governing the set in play: the final-set format in the live deciding set. */
  private activeSetFormat() {
    const formatStructure = this.cachedFormatStructure;
    if (!formatStructure) return undefined;
    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const isDecidingSet = isLiveDecidingSet(formatStructure, setsWon, openSetNumber(this.state.score.sets));
    return isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;
  }

  /**
   * Get the input mode based on what types of entries have been recorded
   *
   * @returns 'points' if only point entries, 'games' if only game entries,
   *   'sets' if only set entries, 'mixed' if multiple types
   */
  getInputMode(): 'points' | 'games' | 'sets' | 'mixed' | 'none' {
    const entries = this.state.history?.entries ?? [];
    if (entries.length === 0) {
      // Legacy: check points array
      if ((this.state.history?.points.length || 0) > 0) return 'points';
      return 'none';
    }

    const types = new Set(
      entries.filter((e) => e.type !== 'setInitialScore' && e.type !== 'endSegment').map((e) => e.type),
    );

    if (types.size === 0) return 'none';
    if (types.size === 1) {
      const type = types.values().next().value;
      if (type === 'point') return 'points';
      if (type === 'game') return 'games';
      if (type === 'set') return 'sets';
    }
    return 'mixed';
  }

  // ===========================================================================
  // Substitution & LineUp
  // ===========================================================================

  /**
   * Set the lineUp for a side (team roster for substitution tracking)
   */
  setLineUp(sideNumber: 1 | 2, lineUp: TeamCompetitor[]): void {
    const side = this.state.sides.find((s) => s.sideNumber === sideNumber);
    if (side) {
      side.lineUp = lineUp.map((tc) => ({ ...tc }));
    }
    // Save initial lineUp snapshot for rebuild
    this.initialLineUps ??= {};
    this.initialLineUps[sideNumber] = lineUp.map((tc) => ({ ...tc }));
  }

  /**
   * Substitute a player within a side's lineUp
   *
   * Records a SubstitutionEvent, updates the lineUp, and pushes to history entries.
   * Substitution happens BEFORE a point — recorded in timeline before next point.
   */
  substitute(options: {
    sideNumber: 1 | 2;
    outParticipantId: string;
    inParticipantId: string;
    timestamp?: string;
  }): SubstitutionResult {
    // Refusals keep the lineUp true to who is on court (S6); nothing is recorded and a pending redo stays
    if (options.inParticipantId === options.outParticipantId) return { success: false, error: 'SAME_PARTICIPANT' };
    const side = this.state.sides.find((s) => s.sideNumber === options.sideNumber);
    if (!side?.lineUp) return { success: false, error: 'NO_LINEUP' };

    // Find the outgoing player in the lineUp
    const outIndex = side.lineUp.findIndex((tc) => tc.participantId === options.outParticipantId);
    if (outIndex === -1) return { success: false, error: 'OUT_NOT_ON_SIDE' };
    const onCourt = this.state.sides.some((s) => s.lineUp?.some((tc) => tc.participantId === options.inParticipantId));
    if (onCourt) return { success: false, error: 'IN_ALREADY_ON_COURT' };

    // Record substitution event
    this.ensureHistory();
    this.state.history!.substitutions ??= [];

    const subEvent: SubstitutionEvent = {
      sideNumber: options.sideNumber,
      outParticipantId: options.outParticipantId,
      inParticipantId: options.inParticipantId,
      beforePointIndex: this.state.history!.points.length,
      setNumber: openSetNumber(this.state.score.sets),
      timestamp: options.timestamp,
    };
    this.state.history!.substitutions.push(subEvent);

    // Update lineUp: replace out with in
    side.lineUp[outIndex] = {
      ...side.lineUp[outIndex],
      participantId: options.inParticipantId,
    };

    // Record in unified timeline
    this.state.history!.entries!.push({
      type: 'substitution',
      data: subEvent,
      timestamp: options.timestamp || nowIso(),
    });

    this.redoStack = [];
    return { success: true };
  }

  /**
   * The competition substitution rules a substitution made now would break. Advisory: substitute() does
   * not consult it, so the host decides whether a required substitution goes ahead. Rules the engine
   * cannot know (roster sizes, timing other than between games) are not reported.
   */
  evaluateSubstitution(): { violations: SubstitutionViolation[] } {
    const rules = this.competitionFormat?.substitutionRules;
    const violations: SubstitutionViolation[] = [];
    if (!rules) return { violations };

    const substitutions = this.state.history?.substitutions ?? [];
    const setInPlay = openSetNumber(this.state.score.sets);
    const points = this.state.history?.points ?? [];
    // an event recorded before setNumber existed is placed by the point it preceded
    const setOf = (sub: SubstitutionEvent) =>
      sub.setNumber ?? ((points[sub.beforePointIndex] as any)?.set ?? setInPlay - 1) + 1;

    if (!rules.allowed) violations.push('NOT_ALLOWED');
    if (rules.maxPerMatchUp !== undefined && substitutions.length >= rules.maxPerMatchUp)
      violations.push('MAX_PER_MATCHUP');
    const inSet = substitutions.filter((sub) => setOf(sub) === setInPlay).length;
    if (rules.maxPerSegment !== undefined && inSet >= rules.maxPerSegment) violations.push('MAX_PER_SEGMENT');
    if (rules.timing === 'BETWEEN_GAMES' && this.gameUnderWay()) violations.push('TIMING');
    if (rules.allowedMatchUpTypes && !rules.allowedMatchUpTypes.includes(this.state.matchUpType))
      violations.push('MATCHUP_TYPE');
    return { violations };
  }

  /** Whether the set in play has a game with points in it. */
  private gameUnderWay(): boolean {
    const set = this.state.score.sets.at(-1);
    if (!set || set.winningSide !== undefined) return false;
    return (set.side1GameScores?.at(-1) || 0) + (set.side2GameScores?.at(-1) || 0) > 0;
  }

  /**
   * Get active players from current lineUp state
   */
  getActivePlayers(): { side1: string[]; side2: string[] } {
    const side1 = this.state.sides.find((s) => s.sideNumber === 1);
    const side2 = this.state.sides.find((s) => s.sideNumber === 2);

    return {
      side1: side1?.lineUp?.map((tc) => tc.participantId) ?? [],
      side2: side2?.lineUp?.map((tc) => tc.participantId) ?? [],
    };
  }

  /**
   * Check if any side has a lineUp set
   */
  private hasLineUp(): boolean {
    return this.state.sides.some((s) => s.lineUp && s.lineUp.length > 0);
  }

  /**
   * The players on court for the point about to be played, in the shape a point records them:
   * both of each side's players in doubles, one per side in singles. Undefined without a lineUp.
   */
  private activePlayersForPoint(): Point['activePlayers'] {
    if (!this.hasLineUp()) return undefined;
    const { side1, side2 } = this.getActivePlayers();
    return this.isDoubles ? [side1, side2] : [side1[0] || '', side2[0] || ''];
  }

  // ===========================================================================
  // Point Multipliers
  // ===========================================================================

  /**
   * Set or update point multipliers
   */
  setPointMultipliers(multipliers: PointMultiplier[]): void {
    this.pointMultipliers = structuredClone(multipliers);
  }

  /**
   * Get current point multipliers
   */
  getPointMultipliers(): PointMultiplier[] {
    return structuredClone(this.pointMultipliers);
  }

  /**
   * Get supplementary state for persistence
   *
   * Returns engine-private state that isn't part of getState() but
   * is needed to fully restore the engine. Used by factory bridge
   * for extension-based persistence.
   */
  getSupplementaryState(): ScoringEngineSupplementaryState {
    return {
      version: SUPPLEMENTARY_STATE_VERSION,
      competitionFormat: this.competitionFormat && { ...this.competitionFormat },
      pointMultipliers: this.pointMultipliers.map((multiplier) => ({ ...multiplier })),
      redoStack: structuredClone(this.redoStack),
      initialLineUps: this.initialLineUps
        ? Object.fromEntries(Object.entries(this.initialLineUps).map(([k, v]) => [k, v.map((tc) => ({ ...tc }))]))
        : undefined,
    };
  }

  /**
   * Restore supplementary state from persistence
   *
   * Loads engine-private state that was saved via getSupplementaryState().
   * Call after setState() to fully restore engine state.
   */
  loadSupplementaryState(state: ScoringEngineSupplementaryState): void {
    // the configuration the history was scored under, so a rebuild scores it the same way (S10)
    if (state.competitionFormat) this.competitionFormat = { ...state.competitionFormat };
    if (state.pointMultipliers) this.pointMultipliers = state.pointMultipliers.map((multiplier) => ({ ...multiplier }));
    if (state.redoStack) this.redoStack = [...state.redoStack];
    if (state.initialLineUps) {
      this.initialLineUps = Object.fromEntries(
        Object.entries(state.initialLineUps).map(([k, v]) => [k, v.map((tc) => ({ ...tc }))]),
      );
    }
  }

  // ===========================================================================
  // competitionFormat Profile Getters
  // ===========================================================================

  getPenaltyProfile(): PenaltyProfile | undefined {
    return this.competitionFormat?.penaltyProfile;
  }

  getPointProfile(): PointProfile | undefined {
    return this.competitionFormat?.pointProfile;
  }

  getTimerProfile(): TimerProfile | undefined {
    return this.competitionFormat?.timerProfile;
  }

  getTimeoutRules(): TimeoutRules | undefined {
    return this.competitionFormat?.timeoutRules;
  }

  getPenaltyBoxProfile(): PenaltyBoxProfile | undefined {
    return this.competitionFormat?.penaltyBoxProfile;
  }

  getSubstitutionRules(): SubstitutionRules | undefined {
    return this.competitionFormat?.substitutionRules;
  }

  getPlayerRules(): PlayerRules | undefined {
    return this.competitionFormat?.playerRules;
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  /**
   * Set or replace event handlers at runtime
   *
   * @param handlers - New event handlers (replaces all existing handlers)
   */
  setEventHandlers(handlers: ScoringEventHandlers | undefined): void {
    this.eventHandlers = handlers;
  }

  /**
   * Get current event handlers
   */
  getEventHandlers(): ScoringEventHandlers | undefined {
    return this.eventHandlers;
  }

  // ===========================================================================
  // Decoration & Editing
  // ===========================================================================

  /**
   * Decorate a point with additional metadata
   *
   * Any point can be decorated, in a match that is COMPLETED too: a penaltyType or an annotation is
   * a correction to the record, not a point played. The metadata is also written to the point's
   * timeline entry, so a later rebuild (undo, redo, editPoint, removePoint) keeps it.
   *
   * @param pointIndex - 0-based point index in history
   * @param metadata - Key-value pairs to attach to the point
   */
  decoratePoint(pointIndex: number, metadata: Record<string, any>): void {
    const point = this.state.history?.points[pointIndex];
    if (point) {
      Object.assign(point, metadata);
      const entry = this.pointEntry(pointIndex);
      if (entry) Object.assign(entry.data, metadata);
    }
  }

  /**
   * The input the scorer receives for a point. A server the competition's rule assigns is supplied here,
   * where getNextServer() decides it, so the server shown, the server recorded and the server a rebuild
   * replays agree (S5). It is calculated, so the timeline does not record it (R2); a server the caller
   * supplied is played as given.
   */
  private scoredPointInput(options: AddPointOptions): AddPointOptions {
    if (options.server !== undefined || options.serverSideNumber !== undefined) return options;
    if (this.competitionFormat?.serverRule !== 'WINNER_SERVES') return options;
    return { ...options, server: this.getNextServer() };
  }

  /** The timeline entry that replays the point at `pointIndex`, if the timeline is kept. */
  private pointEntry(pointIndex: number) {
    return this.state.history?.entries?.find((e) => e.type === 'point' && e.pointIndex === pointIndex);
  }

  /**
   * Record a game index on its set's `hardBoundaries`.
   *
   * @deprecated An annotation only, removed in the next major. Recalculation does not respect it (an
   * edit before it still changes what follows) and a rebuild (undo, redo, editPoint, removePoint)
   * discards it. Nothing in the ecosystem reads it.
   *
   * @param options - Set and game indices to mark
   */
  markHardBoundary(options: { setIndex: number; gameIndex: number }): void {
    const set = this.state.score.sets[options.setIndex];
    if (!set) return;

    set.hardBoundaries ??= [];
    if (!set.hardBoundaries.includes(options.gameIndex)) {
      set.hardBoundaries.push(options.gameIndex);
      set.hardBoundaries.sort((a, b) => a - b);
    }
  }

  /**
   * Edit a point in history
   *
   * Any point can be edited, in a match that is COMPLETED too (a penaltyType added after the
   * match, for one). Every field given is written to the point and to its timeline entry, so a
   * later rebuild keeps the edit; with `recalculate: false` the score is left as it was until the
   * next rebuild, which then applies the edit.
   *
   * @param pointIndex - 0-based point index in history
   * @param newData - New point data (winner, server, penaltyType, metadata)
   * @param options - Edit options
   *   - recalculate: true (default) recalculates from the edited point forward;
   *     false only updates point data
   */
  editPoint(pointIndex: number, newData: Partial<AddPointOptions>, options?: { recalculate?: boolean }): void {
    // refused before the point or its entry changes: a rebuild could not replay it
    validatePointInput(newData);
    const points = this.state.history?.points;
    if (!points || pointIndex < 0 || pointIndex >= points.length) return;

    const shouldRecalculate = options?.recalculate !== false;
    const point = points[pointIndex];
    const entry = this.pointEntry(pointIndex);

    const edits: Record<string, any> = Object.fromEntries(
      Object.entries(newData).filter(([, value]) => value !== undefined),
    );
    // A winner and a server each have two spellings. The point carries both, so it gets both. The
    // entry keeps the one it was played with and its replay reads the 0-indexed spelling first, so
    // an edit in either spelling clears the other there.
    const pointEdits = { ...edits };
    const entryEdits = { ...edits };
    if (edits.winner !== undefined) {
      pointEdits.winningSide = edits.winner + 1;
      entryEdits.winningSide = undefined;
    } else if (edits.winningSide !== undefined) {
      pointEdits.winner = edits.winningSide - 1;
      entryEdits.winner = undefined;
    }
    if (edits.server !== undefined) {
      pointEdits.serverSideNumber = edits.server + 1;
      entryEdits.serverSideNumber = undefined;
    } else if (edits.serverSideNumber !== undefined) {
      pointEdits.server = edits.serverSideNumber - 1;
      entryEdits.server = undefined;
    }

    Object.assign(point, pointEdits);
    if (entry) Object.assign(entry.data, entryEdits);

    if (!shouldRecalculate) return;

    const entries = this.state.history?.entries;

    // Rebuild state from all entries (or points)
    if (entries && entries.length > 0) {
      this.rebuildFromEntries();
    } else {
      this.rebuildState();
    }

    this.redoStack = [];
  }

  /**
   * Remove a point from the match history, recalculating downstream
   * state (score, serve order, set/game progression, …) from the
   * remaining entries.
   *
   * Paired with `editPoint` for targeted, non-LIFO corrections — the
   * top-level `[UNDO]` button remains the LIFO popper. Motivated by
   * the INTENNSE scorekeeper workflow: a penalty gets pushed into the
   * history alongside regular points, and a stray undo tap may pop
   * the penalty when the user meant to pop a prior rally outcome.
   * Letting them target any past entry directly avoids that hazard.
   *
   * @param pointIndex - 0-based point index in history
   * @param options - Remove options
   *   - recalculate: true (default) rebuilds from the surviving
   *     entries; false leaves `points` + `entries` trimmed but state
   *     out of date (useful when the caller intends to make several
   *     edits in a batch and rebuild once at the end).
   *
   * Out of range indexes are a no-op — matches `editPoint`'s tolerance.
   */
  removePoint(pointIndex: number, options?: { recalculate?: boolean }): void {
    const points = this.state.history?.points;
    if (!points || pointIndex < 0 || pointIndex >= points.length) return;

    const shouldRecalculate = options?.recalculate !== false;

    // Splice the point out of history.points.
    points.splice(pointIndex, 1);

    // Splice the corresponding entry out of history.entries, and
    // decrement pointIndex on every later `point` entry so they keep
    // matching their new positions in history.points.
    const entries = this.state.history?.entries;
    if (entries) {
      const entryIdx = entries.findIndex((e) => e.type === 'point' && (e as any).pointIndex === pointIndex);
      if (entryIdx !== -1) entries.splice(entryIdx, 1);
      for (const e of entries) {
        if (e.type === 'point' && (e as any).pointIndex > pointIndex) {
          (e as any).pointIndex -= 1;
        }
      }
    }

    if (!shouldRecalculate) return;

    if (entries && entries.length > 0) {
      this.rebuildFromEntries();
    } else {
      this.rebuildState();
    }

    this.redoStack = [];
  }

  /**
   * Reset match to initial state
   *
   * Clears all points, entries, and undo/redo stacks.
   */
  reset(): void {
    this.state = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: this.matchUpId,
      isDoubles: this.isDoubles,
    });

    this.redoStack = [];
    this.initialScore = undefined;
    this.initialLineUps = undefined;

    this.eventHandlers?.onReset?.(this.buildEventContext());
  }

  // ===========================================================================
  // Private: Apply Methods (no entry recording)
  // ===========================================================================

  private ensureHistory(): void {
    this.state.history ??= { points: [] };
    // A record saved without a timeline starts one from its points, so a later rebuild keeps them.
    this.state.history.entries ??= this.state.history.points.map((point, pointIndex) => ({
      type: 'point',
      data: pointReplayInput(point),
      timestamp: point.timestamp || '',
      pointIndex,
    }));
  }

  /**
   * Build event context for handler callbacks
   */
  private buildEventContext(): ScoringEventContext {
    return {
      state: this.state,
      score: getScore(this.state),
    };
  }

  /**
   * Cache the parsed format structure for introspection methods
   */
  private cacheFormatStructure(): void {
    this.cachedFormatStructure = parse(this.matchUpFormat);
  }

  /**
   * Get initial lineUps for rebuild (before any substitutions)
   */
  private getInitialLineUps(): Record<number, TeamCompetitor[]> | undefined {
    return this.initialLineUps;
  }

  /**
   * Apply a set score to the current state (no entry recording)
   */
  private applyAddSet(options: AddSetOptions): void {
    if (this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
      if (this.state.score.sets.length) throw new Error('Combined-point formats have one segment');
      const sets = [{ ...options, setNumber: 1 }];
      this.validateCombinedScore(sets);
      this.state.score.sets = sets;
      this.completeCombinedScore();
      return;
    }
    const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore } = options;

    // Infer winningSide if not provided
    let winningSide = options.winningSide;
    if (winningSide === undefined) {
      if (side1Score > side2Score) winningSide = 1;
      else if (side2Score > side1Score) winningSide = 2;
    }

    const newSet: SetScore = {
      setNumber: this.state.score.sets.length + 1,
      side1Score,
      side2Score,
      winningSide,
    };

    if (side1TiebreakScore !== undefined) newSet.side1TiebreakScore = side1TiebreakScore;
    if (side2TiebreakScore !== undefined) newSet.side2TiebreakScore = side2TiebreakScore;

    this.state.score.sets.push(newSet);

    if (this.state.matchUpStatus === TO_BE_PLAYED) {
      this.state.matchUpStatus = IN_PROGRESS;
    }

    if (winningSide !== undefined) {
      this.checkMatchCompletion();
    }
  }

  /**
   * Apply a game result to the current state (no entry recording)
   */
  private applyAddGame(options: AddGameOptions): void {
    const { winner, tiebreakScore } = options;

    // Get or create current set
    let currentSet = this.state.score.sets.length > 0 ? this.state.score.sets.at(-1) : undefined;

    if (!currentSet || currentSet.winningSide !== undefined) {
      currentSet = {
        setNumber: this.state.score.sets.length + 1,
        side1Score: 0,
        side2Score: 0,
      };
      this.state.score.sets.push(currentSet);
    }

    // Increment game score
    if (winner === 0) {
      currentSet.side1Score = (currentSet.side1Score || 0) + 1;
    } else {
      currentSet.side2Score = (currentSet.side2Score || 0) + 1;
    }

    // Reset point-level tracking: close the current game's point scores
    // and start a fresh 0-0 game for subsequent addPoint() calls
    if (currentSet.side1GameScores?.length || currentSet.side2GameScores?.length) {
      currentSet.side1GameScores = currentSet.side1GameScores ?? [];
      currentSet.side2GameScores = currentSet.side2GameScores ?? [];
      // Start a new game at 0-0 (the completed game's points are discarded
      // since addGame provides the result without point detail)
      currentSet.side1GameScores.push(0);
      currentSet.side2GameScores.push(0);
    }

    // Store tiebreak scores if provided
    if (tiebreakScore) {
      currentSet.side1TiebreakScore = tiebreakScore[0];
      currentSet.side2TiebreakScore = tiebreakScore[1];
    }

    if (this.state.matchUpStatus === TO_BE_PLAYED) {
      this.state.matchUpStatus = IN_PROGRESS;
    }

    // Check set completion
    this.checkSetCompletion(currentSet);

    // Check match completion if set was won
    if (currentSet.winningSide !== undefined) {
      this.checkMatchCompletion();
    }
  }

  /**
   * Apply a substitution to the current state (no entry recording)
   */
  private applySubstitution(data: SubstitutionEvent): void {
    const side = this.state.sides.find((s) => s.sideNumber === data.sideNumber);
    if (!side?.lineUp) return;

    const outIndex = side.lineUp.findIndex((tc) => tc.participantId === data.outParticipantId);
    if (outIndex === -1) return;

    side.lineUp[outIndex] = {
      ...side.lineUp[outIndex],
      participantId: data.inParticipantId,
    };

    // Track in substitutions log
    this.state.history ??= { points: [] };
    this.state.history.substitutions ??= [];
    this.state.history.substitutions.push(data);
  }

  /**
   * Apply an endSegment to the current state (no entry recording)
   */
  private applyEndSegment(options?: EndSegmentOptions): void {
    const currentSetIndex = (options?.setNumber ?? this.state.score.sets.length) - 1;

    const targetSet = this.state.score.sets[currentSetIndex];
    if (!targetSet || targetSet.winningSide !== undefined) return;

    const s1 = targetSet.side1Score || 0;
    const s2 = targetSet.side2Score || 0;

    // A tiebreak already under way is decided by its points, not by the clock
    if (targetSet.side1TiebreakScore !== undefined) return;

    // Level at time, and the set declares `/TB{n}`: the tiebreak decides it (CA 2026-10-17). The set
    // stays open; its points go to the tiebreak, and the tiebreak's winner closes it.
    const activeFormat = this.activeSetFormat();
    if (s1 === s2 && activeFormat?.timed && activeFormat.tiebreakFormat) {
      targetSet.side1Score = s1;
      targetSet.side2Score = s2;
      targetSet.side1TiebreakScore = 0;
      targetSet.side2TiebreakScore = 0;
      return;
    }

    if (s1 > s2) targetSet.winningSide = 1;
    else if (s2 > s1) targetSet.winningSide = 2;

    // Mark segment as complete even when tied (aggregate formats need new set for next bolt)
    (targetSet as any).segmentComplete = true;

    this.checkMatchCompletion();
  }

  /** Prevent game/timer inputs from creating invalid rally totals. */
  private requireGameOrTimedSegment(): void {
    if (this.cachedFormatStructure?.setFormat?.combinedPointTotal)
      throw new Error('Combined-point segments accept rally or score inputs, not game or timer inputs');
  }

  private validateCombinedScore(sets: SetScore[]): void {
    const format = this.cachedFormatStructure?.setFormat;
    if (
      !format ||
      sets.length !== 1 ||
      !analyzeCombinedPointSet(sets[0], {
        combinedPointTotal: format.combinedPointTotal!,
        tieResolution: format.tieResolution!,
        winningMargin: format.winningMargin,
      }).valid
    )
      throw new Error('Invalid combined-point score');
  }

  private completeCombinedScore(matchUp: MatchUp = this.state): void {
    const format = this.cachedFormatStructure!.setFormat!;
    const analysis = analyzeCombinedPointSet(matchUp.score.sets[0], {
      combinedPointTotal: format.combinedPointTotal!,
      tieResolution: format.tieResolution!,
      winningMargin: format.winningMargin,
    });
    matchUp.score.sets[0].winningSide = analysis.winningSide;
    matchUp.winningSide = analysis.winningSide;
    matchUp.matchUpStatus = analysis.complete ? COMPLETED : IN_PROGRESS;
  }

  private checkSetCompletion(currentSet: SetScore): void {
    const formatStructure = parse(this.state.matchUpFormat);
    if (!formatStructure) return;
    const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
    const setsToWin = Math.ceil(bestOf / 2);

    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const setNumber = (currentSet as any).setNumber ?? this.state.score.sets.indexOf(currentSet) + 1;
    const isDecidingSet = finalSetGoverns(
      formatStructure,
      setNumber,
      setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1,
    );
    const activeSetFormat =
      isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

    if (!activeSetFormat) return;

    const s1 = currentSet.side1Score || 0;
    const s2 = currentSet.side2Score || 0;

    if (activeSetFormat.tiebreakSet) {
      const tbTo = activeSetFormat.tiebreakSet.tiebreakTo || 11;
      const minWin = tiebreakMargin(tbTo, activeSetFormat.tiebreakSet.NoAD);
      if ((s1 >= tbTo || s2 >= tbTo) && Math.abs(s1 - s2) >= minWin) {
        currentSet.winningSide = s1 > s2 ? 1 : 2;
      }
    } else if (!activeSetFormat.timed) {
      const setWon = checkStandardSetWon(s1, s2, activeSetFormat, isDecidingSet, formatStructure.finalSetFormat);
      if (typeof setWon === 'number') {
        currentSet.winningSide = setWon + 1;
      }
    }
  }

  /**
   * Check and apply match completion based on current sets
   */
  private checkMatchCompletion(): void {
    const formatStructure = parse(this.state.matchUpFormat);
    if (!formatStructure) return;
    const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
    const setsToWin = Math.ceil(bestOf / 2);
    checkAndFinalizeMatch(this.state, formatStructure, setsToWin);
  }

  // ===========================================================================
  // Private: State Rebuild
  // ===========================================================================

  /**
   * Rebuild state from entries (mixed-mode)
   *
   * Creates fresh state, then replays all entries in order.
   * For point entries, calls the pure addPoint function.
   * For set/game/segment entries, applies directly.
   */
  private rebuildFromEntries(): void {
    const entries = this.state.history?.entries ?? [];

    const newState = this.prepareRebuildState(entries);

    // Swap state so apply methods work on newState
    this.state = newState;
    this.legacyShapes.clear();

    for (const [index, entry] of entries.entries()) {
      const wasComplete = this.state.matchUpStatus === COMPLETED;
      switch (entry.type) {
        case 'point': {
          // The lineUps start from their initial snapshot and the substitutions replay in order, so
          // the players on court here are the ones who played this point.
          const activePlayers = this.activePlayersForPoint();
          const pointCount = this.state.history?.points.length || 0;
          this.state = addPoint(this.state, this.scoredPointInput(entry.data), {
            pointMultipliers: this.pointMultipliers,
          });
          // Restore entries (addPoint may reset them since it mutates)
          this.state.history!.entries = newState.history!.entries;
          const points = this.state.history!.points;
          const played = points.length > pointCount ? points.at(-1) : undefined;
          if (activePlayers && played) played.activePlayers = activePlayers;
          break;
        }
        case 'set':
          this.applyAddSet(entry.data);
          break;
        case 'game':
          this.applyAddGame(entry.data);
          break;
        case 'endSegment':
          this.applyEndSegment(entry.data);
          break;
        case 'substitution':
          this.applySubstitution(entry.data);
          break;
        case 'setInitialScore':
          // the late-start baseline is part of the timeline (S2): replayed where it was set, gone once undone
          this.applyInitialScore(this.state, entry.data);
          if (this.state.matchUpStatus === TO_BE_PLAYED) this.state.matchUpStatus = IN_PROGRESS;
          break;
        case 'setServer':
          this.replaySetServerEntry(entry.data);
          break;
      }
      this.replayLegacyShape(this.state, wasComplete, scoresAfter(entries, index));
    }
  }

  private prepareRebuildState(entries: any[]): MatchUp {
    const savedLineUps = this.getInitialLineUps();

    // Only what scoring produces starts over. The matchUp's identity, participants and any other
    // metadata a host attached are kept as they are: a rebuild is not a new matchUp.
    const { score: _score, history: _history, winningSide: _winningSide, ...identity } = this.state;
    const { serverFlip: _serverFlip, endTime: _endTime, matchUpStatus: _matchUpStatus, ...kept } = identity;
    // a JSON round trip, as in getState: the state may hold framework proxies structuredClone rejects
    // eslint-disable-next-line no-restricted-syntax
    const copy = JSON.parse(JSON.stringify(kept));
    const fresh = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: this.matchUpId,
      isDoubles: this.isDoubles,
    });
    const newState: MatchUp = { ...copy, score: fresh.score, matchUpStatus: fresh.matchUpStatus };
    newState.matchUpFormat = this.matchUpFormat;

    for (const side of newState.sides) {
      const lineUp = savedLineUps?.[side.sideNumber];
      if (lineUp) side.lineUp = lineUp.map((tc) => ({ ...tc }));
      else delete side.lineUp;
    }

    newState.history = { points: [], entries: [...entries] };

    return newState;
  }

  private replaySetServerEntry(data: { side: number }): void {
    // Recompute the flip at this position during rebuild.
    // The entry stores the desired side; we compare against the
    // base derivation at the current (replayed) state to determine
    // whether a flip is needed from this point forward.
    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const setType = resolveSetType(this.cachedFormatStructure!, setsWon, openSetNumber(this.state.score.sets));
    const baseServer = deriveServerBase(this.state, this.cachedFormatStructure!, setType);
    this.state.serverFlip = data.side !== baseServer;
  }

  /**
   * Rebuild state from points array (legacy, no entries)
   *
   * Creates fresh matchUp and replays all points.
   * If an initial score was set (late arrival), applies it first.
   */
  private rebuildState(): void {
    const currentPoints = this.state.history?.points ?? [];

    // Create fresh matchUp
    let newState = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: this.matchUpId,
      isDoubles: this.isDoubles,
    });

    // Without a timeline no substitution is replayed, so the lineUps on court now are kept as they are
    for (const side of newState.sides) {
      const lineUp = this.state.sides.find((s) => s.sideNumber === side.sideNumber)?.lineUp;
      if (lineUp) side.lineUp = lineUp.map((tc) => ({ ...tc }));
    }

    // Apply initial score if present (late arrival)
    if (this.initialScore) {
      this.applyInitialScore(newState, this.initialScore);
      if (newState.matchUpStatus === TO_BE_PLAYED) {
        newState.matchUpStatus = IN_PROGRESS;
      }
    }

    // Replay all tracked points with multipliers
    this.legacyShapes.clear();
    for (const [index, point] of currentPoints.entries()) {
      const pointCount = newState.history?.points.length || 0;
      const wasComplete = newState.matchUpStatus === COMPLETED;
      newState = addPoint(newState, pointReplayInput(point), { pointMultipliers: this.pointMultipliers });
      // a record without a timeline that scored past a level close replays as v1 (§ 12.8)
      this.replayLegacyShape(newState, wasComplete, index < currentPoints.length - 1);
      // the players recorded on court for the point; with no timeline there is nothing to recompute from
      const replayed = newState.history?.points ?? [];
      const played = replayed.length > pointCount ? replayed.at(-1) : undefined;
      if (point.activePlayers && played) played.activePlayers = point.activePlayers;
    }

    this.state = newState;
  }

  /**
   * Apply initial score to matchUp state
   */
  private applyInitialScore(matchUp: MatchUp, options: InitialScoreOptions): void {
    if (this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
      const sets = options.sets.map((set, index) => ({ ...set, setNumber: index + 1 }));
      if (options.currentSetScore) sets.push({ ...options.currentSetScore, setNumber: sets.length + 1 });
      this.validateCombinedScore(sets);
      matchUp.score.sets = sets;
      this.completeCombinedScore(matchUp);
      return;
    }
    matchUp.score.sets = [];
    for (let i = 0; i < options.sets.length; i++) {
      const setData = options.sets[i];
      const set: SetScore = {
        setNumber: i + 1,
        side1Score: setData.side1Score,
        side2Score: setData.side2Score,
      };

      if (setData.side1TiebreakScore !== undefined) {
        set.side1TiebreakScore = setData.side1TiebreakScore;
      }
      if (setData.side2TiebreakScore !== undefined) {
        set.side2TiebreakScore = setData.side2TiebreakScore;
      }

      if (setData.winningSide === undefined) {
        // Auto-infer winningSide only for completed sets (format-aware).
        // A 1-2 set in SET3-S:6/TB7 is incomplete — don't mark side 2 as winner.
        const fs = this.cachedFormatStructure;
        const isFinalSet = finalSetGoverns(fs, i + 1, i === (fs?.bestOf ?? fs?.exactly ?? 3) - 1);
        const setFormat = fs?.finalSetFormat && isFinalSet ? fs.finalSetFormat : fs?.setFormat;
        const setTo = setFormat?.setTo;
        if (setTo && (setData.side1Score >= setTo || setData.side2Score >= setTo)) {
          if (setData.side1Score > setData.side2Score) set.winningSide = 1;
          else if (setData.side2Score > setData.side1Score) set.winningSide = 2;
        }
      } else {
        set.winningSide = setData.winningSide;
      }

      matchUp.score.sets.push(set);
    }

    if (options.currentSetScore) {
      const currentSet: SetScore = {
        setNumber: matchUp.score.sets.length + 1,
        side1Score: options.currentSetScore.side1Score,
        side2Score: options.currentSetScore.side2Score,
        side1GameScores: [],
        side2GameScores: [],
      };

      if (options.currentGameScore) {
        currentSet.side1GameScores = [options.currentGameScore.side1Points];
        currentSet.side2GameScores = [options.currentGameScore.side2Points];
      } else {
        currentSet.side1GameScores = [0];
        currentSet.side2GameScores = [0];
      }

      matchUp.score.sets.push(currentSet);
    }
  }
}
