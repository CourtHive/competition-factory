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
  Episode,
} from '@Types/scoring/types';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint, deriveServer } from '@Mutate/scoring/addPoint';
import { getScore } from '@Query/scoring/getScore';
import { getScoreboard } from '@Query/scoring/getScoreboard';
import { getWinner } from '@Query/scoring/getWinner';
import { isComplete } from '@Query/scoring/isComplete';
import { getEpisodes } from '@Query/scoring/getEpisodes';
import { resolveSetType, isAggregateFormat } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { calculateMatchStatistics } from '@Query/scoring/statistics/standalone';
import { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
import type { MatchStatistics, StatisticsOptions, StatObject } from '@Query/scoring/statistics/types';
import type { PointMultiplier } from '@Mutate/scoring/resolvePointValue';

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
}
export interface SubstitutionRules {
  allowed: boolean;
  maxPerMatchUp?: number; // Omit = unlimited; 0 = none despite allowed: true
  maxPerSegment?: number;
  allowedMatchUpTypes?: string[];
  timing?: string; // 'BETWEEN_GAMES' | 'BETWEEN_POINTS' | 'ANY'
  minRosterSize?: number;
  maxRosterSize?: number;
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

export interface competitionFormat {
  competitionFormatId?: string;
  competitionFormatName?: string;
  matchUpFormat?: string;
  sport?: string;
  timerProfile?: TimerProfile;
  timeoutRules?: TimeoutRules;
  substitutionRules?: SubstitutionRules;
  playerRules?: PlayerRules;
  penaltyProfile?: PenaltyProfile;
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
  /** Fired when the match completes */
  onMatchComplete?: (context: ScoringEventContext & { matchWinner: 0 | 1 }) => void;
}

export interface ScoringEngineOptions {
  matchUpFormat?: string;
  matchUpId?: string;
  isDoubles?: boolean;
  competitionFormat?: competitionFormat;
  pointMultipliers?: PointMultiplier[];
  eventHandlers?: ScoringEventHandlers;
}

export interface ScoringEngineSupplementaryState {
  redoStack?: ScoreEntry[];
  initialLineUps?: Record<string, TeamCompetitor[]>;
}

/**
 * ScoringEngine - Stateful engine for multi-level scoring
 *
 * Holds internal matchUp state and provides mutation operations.
 * Supports undo/redo across all input modes (points, games, sets, segments).
 * Supports competitionFormat consumption for gameplay rules.
 */
export class ScoringEngine {
  private state!: MatchUp; // Definite assignment - initialized in constructor
  private redoStack: ScoreEntry[] = [];
  private matchUpFormat: string;
  private matchUpId?: string;
  private isDoubles: boolean;
  private initialScore?: InitialScoreOptions; // For late arrival
  private pointMultipliers: PointMultiplier[] = [];
  private readonly competitionFormat?: competitionFormat;
  private initialLineUps?: Record<number, TeamCompetitor[]>;
  private cachedFormatStructure?: FormatStructure;
  private eventHandlers?: ScoringEventHandlers;

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
      this.pointMultipliers = options.pointMultipliers || options.competitionFormat.pointMultipliers || [];
    } else {
      this.matchUpFormat = options.matchUpFormat || 'SET3-S:6/TB7';
      this.pointMultipliers = options.pointMultipliers || [];
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
    this.state = matchUp;
    this.matchUpFormat = matchUp.matchUpFormat;
    this.matchUpId = matchUp.matchUpId;
    this.isDoubles = matchUp.matchUpType === 'DOUBLES';
    this.redoStack = [];
    this.initialScore = undefined;
    this.cacheFormatStructure();
  }

  /**
   * Get current matchUp state as JSON
   *
   * @returns TODS matchUp object (direct reference, not copy)
   */
  getState(): MatchUp {
    return this.state;
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
    const pointIndex = this.state.history?.points.length || 0;

    // Snapshot game/set/match state before point for event detection
    const prevTotalGames = this.state.score.sets.reduce((sum, s) => sum + (s.side1Score || 0) + (s.side2Score || 0), 0);
    const prevCompletedSets = this.state.score.sets.filter((s) => s.winningSide !== undefined).length;
    const prevComplete = this.state.matchUpStatus === 'COMPLETED';

    // Decorate active players from lineUp before adding point
    const activePlayersSnapshot = this.hasLineUp() ? this.getActivePlayers() : undefined;

    // Add point using pure function with multiplier config
    this.state = addPoint(this.state, options, {
      pointMultipliers: this.pointMultipliers,
    });

    // Attach activePlayers to the just-added point
    if (activePlayersSnapshot) {
      const lastPoint = this.state.history!.points[this.state.history!.points.length - 1];
      if (this.isDoubles) {
        (lastPoint as any).activePlayers = [activePlayersSnapshot.side1, activePlayersSnapshot.side2];
      } else {
        (lastPoint as any).activePlayers = [activePlayersSnapshot.side1[0] || '', activePlayersSnapshot.side2[0] || ''];
      }
    }

    // Attach penaltyType to the point if provided
    if (options.penaltyType) {
      const lastPoint = this.state.history!.points[this.state.history!.points.length - 1];
      (lastPoint as any).penaltyType = options.penaltyType;
    }

    // Record entry in unified timeline
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'point',
      data: {
        winner: options.winner,
        winningSide: options.winningSide,
        server: options.server,
        serverSideNumber: options.serverSideNumber,
        serverParticipantId: options.serverParticipantId,
        timestamp: options.timestamp,
        rallyLength: options.rallyLength,
        result: options.result,
        penaltyType: options.penaltyType,
      },
      timestamp: options.timestamp || new Date().toISOString(),
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
      if (curTotalGames > prevTotalGames) {
        this.eventHandlers.onGameComplete?.({ ...ctx, gameWinner: options.winner! });
      }

      // Detect set completion (number of sets with winningSide increased)
      const curCompletedSets = this.state.score.sets.filter((s) => s.winningSide !== undefined).length;
      if (curCompletedSets > prevCompletedSets) {
        const completedSet = this.state.score.sets.findLast((s) => s.winningSide !== undefined);
        const setWinner = completedSet?.winningSide === 1 ? 0 : 1;
        this.eventHandlers.onSetComplete?.({ ...ctx, setWinner });
      }

      // Detect match completion
      if (!prevComplete && this.state.matchUpStatus === 'COMPLETED') {
        const matchWinner = this.state.winningSide === 1 ? 0 : 1;
        this.eventHandlers.onMatchComplete?.({ ...ctx, matchWinner });
      }
    }
  }

  /**
   * Add a complete set score (set-level input)
   *
   * Used by scoring modals where users enter finished set scores directly.
   * Validates against format, infers winningSide if not provided,
   * checks match completion, and records a ScoreEntry in history.
   *
   * @param options - Set score data
   */
  addSet(options: AddSetOptions): void {
    this.applyAddSet(options);

    // Record entry in unified timeline
    this.ensureHistory();
    const winningSide = this.state.score.sets.at(-1)?.winningSide;
    this.state.history!.entries!.push({
      type: 'set',
      data: { ...options, winningSide },
      timestamp: options.timestamp || new Date().toISOString(),
    });

    this.redoStack = [];
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
    this.applyAddGame(options);

    // Record entry in unified timeline
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'game',
      data: options,
      timestamp: options.timestamp || new Date().toISOString(),
    });

    this.redoStack = [];
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
    this.applyEndSegment(options);

    // Record entry in unified timeline
    this.ensureHistory();
    const currentSetIndex = (options?.setNumber ?? this.state.score.sets.length) - 1;
    this.state.history!.entries!.push({
      type: 'endSegment',
      data: { setNumber: currentSetIndex + 1, ...options },
      timestamp: options?.timestamp || new Date().toISOString(),
    });
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
    this.initialScore = options;
    this.redoStack = [];

    // Apply initial score to state
    this.applyInitialScore(this.state, options);

    // Record entry in unified timeline
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'setInitialScore',
      data: options,
      timestamp: new Date().toISOString(),
    });

    // Mark as in-progress
    if (this.state.matchUpStatus === 'TO_BE_PLAYED') {
      this.state.matchUpStatus = 'IN_PROGRESS';
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
    const points = this.state.history?.points || [];
    if (points.length === 0) return false;

    const pointsToUndo = Math.min(count, points.length);
    for (let i = 0; i < pointsToUndo; i++) {
      const point = points.pop()!;
      this.redoStack.push({
        type: 'point',
        data: {
          winner: point.winner,
          server: point.server,
          timestamp: point.timestamp,
          rallyLength: point.rallyLength,
        },
        timestamp: point.timestamp || '',
      });
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

    const toRedo = Math.min(count, this.redoStack.length);
    for (let i = 0; i < toRedo; i++) {
      const entry = this.redoStack.pop()!;

      this.ensureHistory();
      this.state.history!.entries!.push(entry);

      // Also restore point data for point entries
      if (entry.type === 'point') {
        // Point will be re-added during rebuild
      }
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
    return getScore(this.state);
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
    const points = this.state.history?.points || [];
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
    const setType = resolveSetType(this.cachedFormatStructure, setsWon);

    return deriveServer(this.state, this.cachedFormatStructure, setType);
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
    return !!(ff.tiebreakFormat || ff.tiebreakAt !== undefined);
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
   * Get the input mode based on what types of entries have been recorded
   *
   * @returns 'points' if only point entries, 'games' if only game entries,
   *   'sets' if only set entries, 'mixed' if multiple types
   */
  getInputMode(): 'points' | 'games' | 'sets' | 'mixed' | 'none' {
    const entries = this.state.history?.entries || [];
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
      side.lineUp = lineUp;
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
  }): void {
    const side = this.state.sides.find((s) => s.sideNumber === options.sideNumber);
    if (!side?.lineUp) return; // No-op without lineUp

    // Find the outgoing player in the lineUp
    const outIndex = side.lineUp.findIndex((tc) => tc.participantId === options.outParticipantId);
    if (outIndex === -1) return; // Player not in lineUp

    // Record substitution event
    this.ensureHistory();
    this.state.history!.substitutions ??= [];

    const subEvent: SubstitutionEvent = {
      sideNumber: options.sideNumber,
      outParticipantId: options.outParticipantId,
      inParticipantId: options.inParticipantId,
      beforePointIndex: this.state.history!.points.length,
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
      timestamp: options.timestamp || new Date().toISOString(),
    });

    this.redoStack = [];
  }

  /**
   * Get active players from current lineUp state
   */
  getActivePlayers(): { side1: string[]; side2: string[] } {
    const side1 = this.state.sides.find((s) => s.sideNumber === 1);
    const side2 = this.state.sides.find((s) => s.sideNumber === 2);

    return {
      side1: side1?.lineUp?.map((tc) => tc.participantId) || [],
      side2: side2?.lineUp?.map((tc) => tc.participantId) || [],
    };
  }

  /**
   * Check if any side has a lineUp set
   */
  private hasLineUp(): boolean {
    return this.state.sides.some((s) => s.lineUp && s.lineUp.length > 0);
  }

  // ===========================================================================
  // Point Multipliers
  // ===========================================================================

  /**
   * Set or update point multipliers
   */
  setPointMultipliers(multipliers: PointMultiplier[]): void {
    this.pointMultipliers = multipliers;
  }

  /**
   * Get current point multipliers
   */
  getPointMultipliers(): PointMultiplier[] {
    return this.pointMultipliers;
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
      redoStack: [...this.redoStack],
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
   * @param pointIndex - 0-based point index in history
   * @param metadata - Key-value pairs to attach to the point
   */
  decoratePoint(pointIndex: number, metadata: Record<string, any>): void {
    const point = this.state.history?.points[pointIndex];
    if (point) {
      Object.assign(point, metadata);
    }
  }

  /**
   * Mark a game boundary as "hard"
   *
   * Edits before this boundary won't cascade past it during recalculation.
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
   * @param pointIndex - 0-based point index in history
   * @param newData - New point data (winner, server, metadata)
   * @param options - Edit options
   *   - recalculate: true (default) recalculates from the edited point forward;
   *     false only updates point data
   */
  editPoint(pointIndex: number, newData: Partial<AddPointOptions>, options?: { recalculate?: boolean }): void {
    const points = this.state.history?.points;
    if (!points || pointIndex < 0 || pointIndex >= points.length) return;

    const shouldRecalculate = options?.recalculate !== false;
    const point = points[pointIndex];

    // Apply updates to the point object
    if (newData.winner !== undefined) point.winner = newData.winner;
    if (newData.server !== undefined) point.server = newData.server;
    if (newData.timestamp !== undefined) point.timestamp = newData.timestamp;
    if (newData.rallyLength !== undefined) point.rallyLength = newData.rallyLength;
    if (newData.wrongSide !== undefined) (point as any).wrongSide = newData.wrongSide;
    if (newData.wrongServer !== undefined) (point as any).wrongServer = newData.wrongServer;
    if (newData.penaltyPoint !== undefined) (point as any).penaltyPoint = newData.penaltyPoint;

    if (!shouldRecalculate) return;

    // Also update the corresponding entry data if entries exist
    const entries = this.state.history?.entries;
    if (entries) {
      const pointEntry = entries.find((e) => e.type === 'point' && e.pointIndex === pointIndex);
      if (pointEntry) {
        if (newData.winner !== undefined) pointEntry.data.winner = newData.winner;
        if (newData.server !== undefined) pointEntry.data.server = newData.server;
      }
    }

    // Rebuild state from all entries (or points)
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
    this.state.history.entries ??= [];
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

    if (this.state.matchUpStatus === 'TO_BE_PLAYED') {
      this.state.matchUpStatus = 'IN_PROGRESS';
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

    // Store tiebreak scores if provided
    if (tiebreakScore) {
      currentSet.side1TiebreakScore = tiebreakScore[0];
      currentSet.side2TiebreakScore = tiebreakScore[1];
    }

    if (this.state.matchUpStatus === 'TO_BE_PLAYED') {
      this.state.matchUpStatus = 'IN_PROGRESS';
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

    if (s1 > s2) targetSet.winningSide = 1;
    else if (s2 > s1) targetSet.winningSide = 2;

    this.checkMatchCompletion();
  }

  /**
   * Check and apply set completion for a given set
   */
  private checkSetCompletion(currentSet: SetScore): void {
    const formatStructure = parse(this.state.matchUpFormat);
    if (!formatStructure) return;
    const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
    const setsToWin = Math.ceil(bestOf / 2);

    // Determine active set format
    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const isDecidingSet = setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1;
    const activeSetFormat =
      isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

    if (!activeSetFormat) return;

    const s1 = currentSet.side1Score || 0;
    const s2 = currentSet.side2Score || 0;

    // Tiebreak-only set
    if (activeSetFormat.tiebreakSet) {
      const tbTo = activeSetFormat.tiebreakSet.tiebreakTo || 11;
      const isNoAD = activeSetFormat.tiebreakSet.NoAD || false;
      const minWin = isNoAD ? 1 : 2;
      if ((s1 >= tbTo || s2 >= tbTo) && Math.abs(s1 - s2) >= minWin) {
        currentSet.winningSide = s1 > s2 ? 1 : 2;
      }
    }
    // Standard set (not timed)
    else if (!activeSetFormat.timed) {
      const setTo = activeSetFormat.setTo || 6;
      const tiebreakAt =
        (typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : undefined) ?? setTo;
      const noTiebreak = activeSetFormat.noTiebreak || false;
      const winBy = activeSetFormat.winBy || 2;

      // Tiebreak was just played or regular win
      if (
        (!noTiebreak &&
          currentSet.side1TiebreakScore !== undefined &&
          (s1 === tiebreakAt + 1 || s2 === tiebreakAt + 1)) ||
        ((s1 >= setTo || s2 >= setTo) && Math.abs(s1 - s2) >= winBy)
      ) {
        currentSet.winningSide = s1 > s2 ? 1 : 2;
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
    const isAggregate = isAggregateFormat(formatStructure);
    const exactly = formatStructure.exactly;

    if (isAggregate) {
      const totalSets = exactly || bestOf;
      // For aggregate formats, all sets count (tied sets are valid — e.g., outs-based innings)
      const playedSets = this.state.score.sets.length;
      if (playedSets >= totalSets) {
        const totals = this.state.score.sets.reduce(
          (acc, set) => {
            if (set.side1TiebreakScore === undefined) {
              acc[0] += set.side1Score ?? 0;
              acc[1] += set.side2Score ?? 0;
            } else {
              acc[0] += set.side1TiebreakScore;
              acc[1] += set.side2TiebreakScore ?? 0;
            }
            return acc;
          },
          [0, 0],
        );
        if (totals[0] !== totals[1]) {
          this.state.matchUpStatus = 'COMPLETED';
          this.state.winningSide = totals[0] > totals[1] ? 1 : 2;
          this.state.endTime = new Date().toISOString();
        }
      }
    } else {
      const setsWon: [number, number] = [0, 0];
      this.state.score.sets.forEach((set) => {
        if (set.winningSide === 1) setsWon[0]++;
        if (set.winningSide === 2) setsWon[1]++;
      });

      const hasWinner = setsWon[0] >= setsToWin || setsWon[1] >= setsToWin;
      if (
        hasWinner &&
        (!exactly || this.state.score.sets.filter((s) => s.winningSide !== undefined).length >= exactly)
      ) {
        const matchWinner = setsWon[0] >= setsToWin ? 0 : 1;
        this.state.matchUpStatus = 'COMPLETED';
        this.state.winningSide = matchWinner + 1;
        this.state.endTime = new Date().toISOString();
      }
    }
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
    const entries = this.state.history?.entries || [];

    // Capture initial lineUps before rebuild (set via setLineUp, before any subs)
    // We need the original lineUp; substitution entries in the timeline will replay the changes
    const savedLineUps = this.getInitialLineUps();

    // Create fresh state
    let newState = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: this.matchUpId,
      isDoubles: this.isDoubles,
    });

    // Restore initial lineUps on fresh state
    if (savedLineUps) {
      for (const side of newState.sides) {
        if (savedLineUps[side.sideNumber]) {
          side.lineUp = savedLineUps[side.sideNumber].map((tc) => ({ ...tc }));
        }
      }
    }

    // Apply initial score if present
    if (this.initialScore) {
      this.applyInitialScore(newState, this.initialScore);
      if (newState.matchUpStatus === 'TO_BE_PLAYED') {
        newState.matchUpStatus = 'IN_PROGRESS';
      }
    }

    // Preserve entries (they represent the timeline, not derived state)
    newState.history = { points: [], entries: [...entries] };

    // Swap state temporarily so apply methods work on newState
    this.state = newState;

    for (const entry of entries) {
      switch (entry.type) {
        case 'point':
          // Replay through the pure addPoint function with multipliers
          this.state = addPoint(this.state, entry.data, {
            pointMultipliers: this.pointMultipliers,
          });
          // Restore entries (addPoint may reset them since it mutates)
          this.state.history!.entries = newState.history.entries;
          break;
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
          // Already applied above via this.initialScore
          break;
      }
    }

    // State is now rebuilt; no need to restore savedState
  }

  /**
   * Rebuild state from points array (legacy, no entries)
   *
   * Creates fresh matchUp and replays all points.
   * If an initial score was set (late arrival), applies it first.
   */
  private rebuildState(): void {
    const currentPoints = this.state.history?.points || [];

    // Create fresh matchUp
    let newState = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: this.matchUpId,
      isDoubles: this.isDoubles,
    });

    // Apply initial score if present (late arrival)
    if (this.initialScore) {
      this.applyInitialScore(newState, this.initialScore);
      if (newState.matchUpStatus === 'TO_BE_PLAYED') {
        newState.matchUpStatus = 'IN_PROGRESS';
      }
    }

    // Replay all tracked points with multipliers
    for (const point of currentPoints) {
      newState = addPoint(
        newState,
        {
          winner: point.winner,
          server: point.server,
          timestamp: point.timestamp,
          rallyLength: point.rallyLength,
          result: point.result,
        },
        {
          pointMultipliers: this.pointMultipliers,
        },
      );
    }

    this.state = newState;
  }

  /**
   * Apply initial score to matchUp state
   */
  private applyInitialScore(matchUp: MatchUp, options: InitialScoreOptions): void {
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

      if (setData.winningSide !== undefined) {
        set.winningSide = setData.winningSide;
      } else if (setData.side1Score > setData.side2Score) {
        set.winningSide = 1;
      } else if (setData.side2Score > setData.side1Score) {
        set.winningSide = 2;
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
