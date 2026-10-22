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

import { analyzeCombinedPointSet } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { calculateMatchStatistics } from '@Query/scoring/statistics/standalone';
import { openSetNumber } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
import { isDecisionRequired } from '@Query/scoring/decisionRequired';
import { installScoringDifferential } from './v2/differential';
import { getScoringEngine } from '@Global/state/globalState';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { getScoreboard } from '@Query/scoring/getScoreboard';
import { checkTiebreakWon } from '@Mutate/scoring/gameWon';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { getEpisodes } from '@Query/scoring/getEpisodes';
import { isComplete } from '@Query/scoring/isComplete';
import { getWinner } from '@Query/scoring/getWinner';
import { getScore } from '@Query/scoring/getScore';
import { ScoringEngineV2 } from './v2/engine';
import { isObject } from '@Tools/objects';
import { nowIso } from '@Tools/clock';
import {
  inputLevels,
  resolveSetType,
  inputLevelError,
  isAggregateFormat,
  isLiveDecidingSet,
} from '@Tools/scoring/scoringUtilities';
import {
  addPoint,
  deriveServer,
  liveServiceRule,
  deriveServerBase,
  pointCountsUnits,
  validatePointInput,
  checkStandardSetWon,
} from '@Mutate/scoring/addPoint';
import {
  replayAsV1,
  scoresAfter,
  matchCompletion,
  LEGACY_IGNORED_INPUT,
  LEGACY_REFUSED_INPUT,
  checkAndFinalizeMatch,
  SCORING_PAST_LEVEL_CLOSE,
} from '@Mutate/scoring/matchCompletion';
import {
  markSet,
  setFormatFor,
  judgeSetTotal,
  buildJudgedSet,
  setInputRefusal,
  settleSetWinner,
  gameInputRefusal,
  baselineInputRefusal,
  endSegmentInputRefusal,
} from '@Mutate/scoring/judgeSet';

// constants and types
import type { MatchStatistics, StatisticsOptions, StatObject } from '@Query/scoring/statistics/types';
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SCORING_ENGINE_V2 } from '@Constants/scoringEngineConstants';
import type { PointMultiplier } from '@Mutate/scoring/resolvePointValue';
import type { InputLevels } from '@Tools/scoring/scoringUtilities';
import type { ClosableSet } from '@Mutate/scoring/judgeSet';
import type {
  MatchUp,
  IgnoredInput,
  ScoringActionResult,
  AddPointOptions,
  AddSetOptions,
  AddGameOptions,
  ScoreEntry,
  SetFormatStructure,
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

/** A scoring input the timeline recorded. */
const RECORDED: ScoringActionResult = { recorded: true };

/** The timeline entries `getInputMode()` reports: the scoring inputs (§ 11.4). */
const INPUT_MODE_TYPES = new Set(['point', 'game', 'set']);

/** What the action boundary does with an input: refuse it, ignore it, or take it. */
type Verdict = { refusal?: string; ignored?: IgnoredInput };

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
  // under WINNER_SERVES a correction names the next point's server only: the side, and the points played then
  private winnerServesNext?: { side: 0 | 1; atPoint: number };
  // points removed without recalculating since the last rebuild: the stale score still counts them (§ 12.4)
  private uncountedRemovals = 0;
  // a loaded record's score as stored, which getState shows until the next action writes (§ 12.2, SE2c-D3)
  private storedScore?: Pick<MatchUp, 'score' | 'matchUpStatus' | 'winningSide' | 'endTime' | 'serverFlip'> & {
    /** the record's substitution list as stored: the rebuilt one is written by the next action (SE2c-D3) */
    substitutions?: NonNullable<MatchUp['history']>['substitutions'];
  };
  private matchUpFormat!: string; // assigned below, unless the constructor hands back the v2 shell
  private matchUpId?: string;
  private isDoubles!: boolean;
  private state!: MatchUp; // Definite assignment - initialized in constructor

  /**
   * Create new ScoringEngine
   *
   * @param options - Engine configuration
   */
  constructor(options: ScoringEngineOptions = {}) {
    // with v2 selected alone, the v2 shell is the engine: the class stays the one entry point (plan § 2, SE2c)
    if (getScoringEngine() === SCORING_ENGINE_V2) return new ScoringEngineV2(options) as unknown as ScoringEngine;
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
    this.winnerServesNext = undefined;
    this.uncountedRemovals = 0;
    // A rebuild starts the lineUps from their initial snapshot. Loaded without one (no
    // loadSupplementaryState to follow), the snapshot is the loaded lineUps with the substitution
    // timeline undone; never a previous matchUp's.
    this.initialLineUps = deriveInitialLineUps(matchUp);
    this.cacheFormatStructure();
    this.storedScore = undefined;
    this.prepareFromTimeline();
  }

  /**
   * A loaded record's timeline is authoritative (§ 12.2; SE2c-D3, CA 2026-10-21): the score the next action is taken
   * on, and every view, are rebuilt from it with the engine's configuration, while the record keeps its points and
   * shows its stored score until that action writes. A record without a timeline goes on from its stored score.
   */
  private prepareFromTimeline(): void {
    if (!this.state.history?.entries?.length || !this.cachedFormatStructure) return;
    const stored = this.storedScore ?? this.scoreAsStored();
    // eslint-disable-next-line no-restricted-syntax
    const points = JSON.parse(JSON.stringify(this.state.history.points ?? []));
    this.rebuildFromEntries();
    this.state.history!.points = points;
    // the legacy shapes are the last rebuild's, and none has run on the record yet
    this.legacyShapes.clear();
    this.storedScore = stored;
  }

  private scoreAsStored(): NonNullable<ScoringEngine['storedScore']> {
    const { score, matchUpStatus, winningSide, endTime, serverFlip } = this.state;
    const substitutions = this.state.history?.substitutions;
    // eslint-disable-next-line no-restricted-syntax
    return JSON.parse(JSON.stringify({ score, matchUpStatus, winningSide, endTime, serverFlip, substitutions }));
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
    const record = this.storedScore ? this.withStoredScore() : this.state;
    // eslint-disable-next-line no-restricted-syntax
    return JSON.parse(JSON.stringify(record));
  }

  /** the record as loaded: the stored score over the state the next action is taken on (SE2c-D3) */
  private withStoredScore(): MatchUp {
    const {
      score: _score,
      winningSide: _winningSide,
      endTime: _endTime,
      serverFlip: _serverFlip,
      ...rest
    } = this.state;
    const stored = this.storedScore!;
    const { substitutions: _substitutions, ...history } = rest.history ?? { points: [] };
    return {
      ...rest,
      ...(rest.history
        ? { history: { ...history, ...(stored.substitutions ? { substitutions: stored.substitutions } : {}) } }
        : {}),
      score: stored.score,
      matchUpStatus: stored.matchUpStatus,
      ...(stored.winningSide === undefined ? {} : { winningSide: stored.winningSide }),
      ...(stored.endTime === undefined ? {} : { endTime: stored.endTime }),
      ...(stored.serverFlip === undefined ? {} : { serverFlip: stored.serverFlip }),
    };
  }

  // ===========================================================================
  // Input Methods
  // ===========================================================================

  /**
   * Add a point to the match
   *
   * @param options - Point options (winner, server, etc.)
   */
  addPoint(options: AddPointOptions): ScoringActionResult {
    // refused before anything is written: an unscorable format or an invalid input (S9), a segment of
    // outs, which takes set totals (S4), or a value where a point is not a unit (§ 4.4)
    this.requireFormat();
    validatePointInput(options);
    if (!this.getInputLevels().point) throw inputLevelError('point');
    const valueRefusal = this.pointValueRefusal(options);
    if (valueRefusal) throw new Error(valueRefusal);
    // before the point is scored: a record without a timeline starts one from the points it already has
    this.ensureHistory();
    const pointIndex = this.state.history?.points.length || 0;

    // Snapshot game/set/match state before point for event detection
    const prevTotalGames = this.state.score.sets.reduce((sum, s) => sum + (s.side1Score || 0) + (s.side2Score || 0), 0);
    const prevCompletedSets = this.state.score.sets.filter((s) => s.winningSide !== undefined).length;
    const prevComplete = this.state.matchUpStatus === COMPLETED;
    // a point that is a unit of a timed segment's score completes no game (§ 11.5)
    const pointBuildsGames = !this.pointIsTimedUnit();

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
    if ((this.state.history?.points.length || 0) === pointIndex)
      return { recorded: false, ignored: this.ignoredPoint(options) };

    // a record a removal left stale numbers the point as its score counts it, until the next rebuild (SE2c-D6)
    if (this.uncountedRemovals) {
      const played = this.state.history!.points.at(-1) as any;
      played.index += this.uncountedRemovals;
      played.pointNumber += this.uncountedRemovals;
    }

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
    this.storedScore = undefined;
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
      const gameCompleted = curTotalGames > prevTotalGames && pointBuildsGames;
      if (gameCompleted && !this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
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
    return RECORDED;
  }

  /** A format that does not parse refuses every action that scores or names a server (§ 1.1, § 2). */
  private requireFormat(): FormatStructure {
    if (!this.cachedFormatStructure) throw new Error(`Invalid matchUpFormat: ${this.matchUpFormat}`);
    return this.cachedFormatStructure;
  }

  /**
   * Input the match takes no more of, ignored and recording nothing: any after `COMPLETED` (§ 9.6), and a
   * set beyond N in an exactly format (§ 9.2 rule 4).
   */
  private closedToInput(): IgnoredInput | undefined {
    if (this.state.matchUpStatus === COMPLETED) return 'MATCH_COMPLETED';
    const formatStructure = this.cachedFormatStructure;
    const exactly = !isAggregateFormat(formatStructure) && formatStructure?.exactly;
    if (exactly && openSetNumber(this.state.score.sets) > exactly) return 'NO_SET_BEYOND_N';
    return undefined;
  }

  /** Why the pure scorer ignored a point (§ 2.1). */
  private ignoredPoint(options: AddPointOptions): IgnoredInput {
    if (options?.winner == null && options?.winningSide == null) return 'NO_WINNER';
    return this.closedToInput() ?? 'MATCH_COMPLETED';
  }

  /**
   * A `scoreValue` other than 1 where a point is not a unit (§ 2.1 rule 7, § 4.4; CA 2026-10-18): a segment
   * whose points build games, and a combined total.
   */
  private pointValueRefusal(options: Partial<AddPointOptions>): string | undefined {
    const { scoreValue } = options ?? {};
    const formatStructure = this.cachedFormatStructure;
    if (scoreValue === undefined || scoreValue === 1 || !formatStructure) return undefined;
    const setsWon = this.setsWon();
    const setType = resolveSetType(formatStructure, setsWon, openSetNumber(this.state.score.sets));
    if (pointCountsUnits(this.state, formatStructure, setType, this.activeSetFormat())) return undefined;
    return `A point is not a unit of this segment's score: scoreValue ${scoreValue} is refused`;
  }

  /**
   * Whether the next point is a unit of a timed segment's score (§ 6.2 rules 1 and 3), not a point of a
   * game: points-based timed segments, and games-based ones whose games are the sport's own units. The
   * tiebreak a level segment plays at time is a game.
   */
  private pointIsTimedUnit(): boolean {
    const formatStructure = this.cachedFormatStructure;
    if (!formatStructure) return false;
    const setType = resolveSetType(formatStructure, this.setsWon(), openSetNumber(this.state.score.sets));
    if (setType !== 'timed') return false;
    return pointCountsUnits(this.state, formatStructure, setType, this.activeSetFormat());
  }

  private setsWon(): [number, number] {
    const setsWon: [number, number] = [0, 0];
    for (const set of this.state.score.sets) {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    }
    return setsWon;
  }

  /** The game, set or segment-end action that ends a match level fires onMatchTie (§ 11.5). */
  private notifyLevelClose(): void {
    if (isDecisionRequired(this.state)) this.eventHandlers?.onMatchTie?.(this.buildEventContext());
  }

  /**
   * The legacy shapes the last rebuild met (spec § 12.8), each replayed as v1 replayed it:
   * `scoringPastLevelClose` when a stored timeline scored past a level close, `refusedInput` for an entry
   * the action boundary now refuses (invalid facts, a segment end on a set that is not timed or is closed, a
   * value where a point is not a unit, a second baseline), and `ignoredInput` for one it now ignores (input
   * after `COMPLETED` or past N).
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
   * Add a set total (set-level input)
   *
   * Used by scoring modals where users enter set scores directly. A total entered while a set is in play
   * closes that set with the declared total, its points staying on the history, and scoring continues in
   * the next set; otherwise it is the next set. The total is judged by its segment's
   * rule (spec § 2.3, CA 2026-10-18): a total the rule calls finished is recorded with the rule's winner
   * (6-4, 7-6 with a tiebreak, 7-5; a timed total is a finished segment); an explicit `winningSide`
   * naming the loser of a finished total, or a side that is not ahead, is refused; an explicit
   * `winningSide` for the side ahead on an unfinished total is a set-level mercy or manual end; and an
   * unfinished total with no winner is recorded as the set in play (3-1 in a set to six).
   *
   * Ignored, recording nothing, after the match is `COMPLETED` and past the N sets of an exactly format.
   *
   * @param options - Set score data
   */
  addSet(options: AddSetOptions): ScoringActionResult {
    this.requireFormat();
    const refusal = setInputRefusal(options);
    if (refusal) throw new Error(refusal);
    const ignored = this.closedToInput();
    if (ignored) return { recorded: false, ignored };
    const winningSide = this.applyAddSet(options, true);

    // Record entry in unified timeline
    this.ensureHistory();
    this.state.history!.entries!.push({
      type: 'set',
      data: { ...options, winningSide },
      timestamp: options.timestamp || nowIso(),
    });

    this.redoStack = [];
    this.notifyLevelClose();
    return RECORDED;
  }

  /**
   * Add a game result (game-level input)
   *
   * For scenarios where game-by-game tracking is needed without point detail. Adds the game to the set
   * in play, opening the next set when the last one is closed (won, or a timed segment ended), checks
   * set and match completion, and records a ScoreEntry in history. In a tiebreak-only segment a game is
   * the segment won 1-0, `tiebreakScore` its points, checked against the race to n (spec § 2.2, § 5).
   *
   * Ignored, recording nothing, after the match is `COMPLETED` and past the N sets of an exactly format.
   *
   * @param options - Game result data
   */
  addGame(options: AddGameOptions): ScoringActionResult {
    this.requireFormat();
    const refusal = gameInputRefusal(options);
    if (refusal) throw new Error(refusal);
    this.requireGameOrTimedSegment();
    if (!this.getInputLevels().game) throw inputLevelError('game');
    const verdict = this.gameVerdict(options);
    if (verdict.refusal) throw new Error(verdict.refusal);
    if (verdict.ignored) return { recorded: false, ignored: verdict.ignored };
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
    return RECORDED;
  }

  /** What the action boundary does with a game (§ 2.2): its facts, its segment, and the match's state. */
  private gameVerdict(options: AddGameOptions): Verdict {
    const refusal = gameInputRefusal(options);
    if (refusal) return { refusal };
    const ignored = this.closedToInput();
    if (ignored) return { ignored };
    const tiebreakSet = this.activeSetFormat()?.tiebreakSet;
    const { winner, tiebreakScore } = options;
    if (tiebreakSet && tiebreakScore) {
      const tiebreakTo = tiebreakSet.tiebreakTo || 11;
      const won = checkTiebreakWon(tiebreakScore[0], tiebreakScore[1], tiebreakTo, tiebreakSet.NoAD);
      if (won !== winner)
        return {
          refusal: `tiebreakScore ${tiebreakScore.join('-')} does not win a race to ${tiebreakTo} for side ${winner + 1}`,
        };
    }
    return {};
  }

  /**
   * End a timed segment
   *
   * Ends timed segments only (spec § 2.4, CA 2026-10-18): the timed segment in play, or the one
   * `setNumber` names, by § 6.4. Refused on any other segment kind, on a segment already closed, and
   * when there is no timed segment to end. Ignored, recording nothing, after the match is `COMPLETED` and
   * during the tiebreak a level timed segment plays at time. `reason` is a free host string, recorded and
   * never interpreted.
   *
   * @param options - Segment options
   */
  endSegment(options?: EndSegmentOptions): ScoringActionResult {
    this.requireFormat();
    this.requireGameOrTimedSegment();
    const verdict = this.endSegmentVerdict(options);
    if (verdict.refusal) throw new Error(verdict.refusal);
    if (verdict.ignored) return { recorded: false, ignored: verdict.ignored };
    this.applyEndSegment(options);

    // Record entry in unified timeline
    this.ensureHistory();
    const currentSetIndex = (options?.setNumber ?? this.state.score.sets.length) - 1;
    this.state.history!.entries!.push({
      type: 'endSegment',
      data: { setNumber: currentSetIndex + 1, ...options },
      timestamp: options?.timestamp || nowIso(),
    });

    this.redoStack = [];
    this.notifyLevelClose();
    return RECORDED;
  }

  /** What the action boundary does with a segment end (§ 2.4, § 6.4). */
  private endSegmentVerdict(options?: EndSegmentOptions): Verdict {
    const refusal = endSegmentInputRefusal(options);
    if (refusal) return { refusal };
    if (this.state.matchUpStatus === COMPLETED) return { ignored: 'MATCH_COMPLETED' };
    const sets = this.state.score.sets;
    const setNumber = options?.setNumber ?? sets.length;
    const target = sets[setNumber - 1] as ClosableSet | undefined;
    const setFormat = target ? setFormatFor(this.cachedFormatStructure, sets, setNumber) : this.activeSetFormat();
    if (!setFormat?.timed) return { refusal: 'endSegment ends timed segments only' };
    if (!target) return { refusal: 'There is no timed segment to end' };
    if (target.winningSide !== undefined || target.segmentComplete)
      return { refusal: `Segment ${setNumber} is closed and takes no input` };
    if (target.side1TiebreakScore !== undefined) return { ignored: 'TIEBREAK_IN_PLAY' };
    return {};
  }

  /**
   * Set the initial score before beginning point-by-point tracking
   *
   * A late-start baseline (spec § 2.5, CA 2026-10-18): its sets are judged by their segment rule, as addSet
   * judges a total (6-5 is not won; the final set is the one the deciding-set rule names, read from the
   * score; a tiebreak-only set is read from its points); a baseline that decides the match completes it;
   * an unfinished last set is the set in play; a supplied `server` is recorded as a server correction at the
   * baseline. Refused once the timeline holds scoring entries (a correction uses editPoint, removePoint or
   * undo), and when a `matchUpStatus` or `winningSide` given beside the sets disagrees with them.
   *
   * @param options - Initial score state
   */
  setInitialScore(options: InitialScoreOptions): void {
    this.requireFormat();
    const refusal = this.baselineRefusal(options);
    if (refusal) throw new Error(refusal);
    this.initialScore = options;

    // Apply initial score to state
    this.applyInitialScore(this.state, options);

    // Record entry in unified timeline, the server correction attached to it
    this.ensureHistory();
    const entry: ScoreEntry = { type: 'setInitialScore', data: options, timestamp: nowIso() };
    if (options.server === 0 || options.server === 1) {
      entry.serverCorrection = options.server;
      this.applyServerCorrection(options.server);
    }
    this.state.history!.entries!.push(entry);
    this.redoStack = [];
    this.storedScore = undefined;
    this.notifyLevelClose();
  }

  /** Why a baseline is refused (§ 2.5), if it is: its facts, a second baseline, or what it claims. */
  private baselineRefusal(options: InitialScoreOptions): string | undefined {
    const refusal = baselineInputRefusal(options) ?? this.secondBaselineRefusal();
    if (refusal) return refusal;
    if (this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
      const sets = options.sets.map((set, index) => ({ ...set, setNumber: index + 1 }));
      if (options.currentGameScore) return 'Combined-point formats have no game score';
      if (options.currentSetScore) sets.push({ ...options.currentSetScore, setNumber: sets.length + 1 });
      this.validateCombinedScore(sets);
      return undefined;
    }
    const baseline = this.buildBaseline(options);
    return baseline.refusal ?? this.baselineConsistencyRefusal(options, baseline.sets);
  }

  /** A second baseline once the timeline holds scoring entries (§ 2.5 rule 5). */
  private secondBaselineRefusal(): string | undefined {
    const history = this.state.history;
    const scored = history?.entries ? scoresAfter(history.entries, -1) : (history?.points.length ?? 0) > 0;
    if (!scored) return undefined;
    return 'A baseline is refused once scoring has been recorded: correct it with editPoint, removePoint or undo';
  }

  /** A `matchUpStatus` or `winningSide` beside the sets that disagrees with them (§ 2.5 rule 6). */
  private baselineConsistencyRefusal(options: InitialScoreOptions, sets: SetScore[]): string | undefined {
    const { matchUpStatus, winningSide } = options;
    const formatStructure = this.cachedFormatStructure!;
    const setsToWin = Math.ceil((formatStructure.exactly || formatStructure.bestOf || 3) / 2);
    const completion = matchCompletion({ score: { sets } } as MatchUp, formatStructure, setsToWin);
    const winner = completion.complete ? completion.winningSide : undefined;
    if (matchUpStatus === COMPLETED && !completion.complete) return 'matchUpStatus COMPLETED disagrees with the sets';
    if ((matchUpStatus === IN_PROGRESS || matchUpStatus === TO_BE_PLAYED) && completion.complete)
      return `matchUpStatus ${matchUpStatus} disagrees with sets that decide the match`;
    const scoredStatus = matchUpStatus == null || matchUpStatus === COMPLETED;
    if (winningSide != null && scoredStatus && winningSide !== winner)
      return `winningSide ${winningSide} disagrees with the sets`;
    return undefined;
  }

  /**
   * Record a challenge (spec § 2.8, CA 2026-10-18): a versioned timeline action that changes no score. It
   * records the side that challenged and any host fields, is kept through every rebuild, and `undo` takes
   * it back when it was recorded last. It writes the entry epixodic writes by hand,
   * `{ type: 'challenge', data: { sideNumber } }`, which the engine reads unchanged.
   */
  addChallenge(options: { sideNumber: 1 | 2; timestamp?: string; [key: string]: any }): void {
    if (options?.sideNumber !== 1 && options?.sideNumber !== 2)
      throw new Error(`Invalid sideNumber: ${options?.sideNumber}`);
    const { timestamp, ...data } = options;
    this.recordEntry({ type: 'challenge', data, timestamp: timestamp || nowIso() });
  }

  /** Record an annotation (spec § 2.8): host data on the timeline, changing no score. */
  addAnnotation(data: Record<string, any>, options?: { timestamp?: string }): void {
    this.recordEntry({
      type: 'annotation',
      data: isObject(data) ? { ...data } : data,
      timestamp: options?.timestamp || nowIso(),
    });
  }

  /** A recorded action that changes no score: on the timeline, clearing the redo stack (§ 12.3). */
  private recordEntry(entry: ScoreEntry): void {
    this.ensureHistory();
    this.state.history!.entries!.push(entry);
    this.redoStack = [];
    this.storedScore = undefined;
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
    // undoing no action does nothing, and says so (§ 12.3, SE3-E2)
    if (count < 1) return false;
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
    if (this.redoStack.length === 0 || count < 1) return false;

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
    const score = JSON.parse(JSON.stringify(getScore(this.state)));
    // the competition's rule decides the server shown, as it decides the server played (§ 10.7)
    if (score.situation && !score.situation.decisionRequired && this.competitionFormat?.serverRule === 'WINNER_SERVES')
      Object.assign(score.situation, { server: this.getNextServer(), serverDerived: true });
    return score;
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
    // where no server is derived the answer is a placeholder: see isServerDerived()
    const serverRule = this.competitionFormat?.serverRule;

    if (serverRule === 'WINNER_SERVES') {
      const corrected = this.winnerServesCorrection();
      if (corrected !== undefined) return corrected;
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
   * Whether `getNextServer()` is the engine's derivation (spec § 10.4, CA 2026-10-18). False where no server
   * is derived: in a combined total `P{n}`, and in a tiebreak-only format (`S:TB{n}`) until each sport's own
   * service rule is added; and once the match is complete, which has no next point (CA 2026-10-21).
   * `getNextServer()` still answers 0 or 1 there, for API compatibility, but the answer is only a placeholder.
   */
  isServerDerived(): boolean {
    if (this.state.matchUpStatus === COMPLETED) return false;
    if (this.competitionFormat?.serverRule === 'WINNER_SERVES') return true;
    return liveServiceRule(this.state, this.cachedFormatStructure) !== 'none';
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
    this.requireFormat();
    if (side !== 0 && side !== 1) throw new Error(`Invalid server: ${side}`);
    const before = this.state.serverFlip;
    const named = this.winnerServesCorrection();
    this.applyServerCorrection(side);
    // a correction that changes nothing records nothing and keeps the redo stack (§ 12.3); under WINNER_SERVES it
    // names the next point's server only, so it changes nothing when that side is named already (SE3-E3)
    const unchanged =
      this.competitionFormat?.serverRule === 'WINNER_SERVES'
        ? named === side
        : before !== undefined && before === this.state.serverFlip;
    if (unchanged) return;

    // A rule-driven correction (e.g. INTENNSE's post-point serving rules) is not an action of its own: it
    // is recorded on the entry before it, replayed with it and undone with it, so undo takes back the
    // point and its correction together (§ 2.6, CA 2026-10-18). With nothing before it there is no entry
    // to attach it to: it is the match's initial server, kept on the record, so every rebuild and reload
    // starts from it, and it adds nothing to the timeline (SE3-E1, CA 2026-10-21).
    if (options?.recordEntry === false) {
      this.ensureHistory();
      const preceding = this.state.history!.entries!.at(-1);
      if (!preceding) {
        this.state.history!.initialServer = side;
        this.storedScore = undefined;
        return;
      }
      preceding.serverCorrection = side;
      this.redoStack = [];
      return;
    }

    // Record in timeline for undo/redo — store the desired side so
    // rebuild can recompute the flip at the correct position
    this.recordEntry({ type: 'setServer', data: { side }, timestamp: nowIso() });
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
   * The format governing the set in play: the final-set format in the live deciding set, the ordinary
   * set format otherwise (scoring spec § 3.2). It is the format the engine judges the next point, game or
   * set total by, so a consumer offering inputs reads it here instead of re-deriving the deciding-set rule.
   * Once the match is complete it is the format a further set would take; the engine records no input then.
   *
   * @returns The set format in play, or undefined if the format string is invalid
   */
  getSetInPlayFormat(): SetFormatStructure | undefined {
    return this.activeSetFormat();
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

    // only scoring inputs count: not baselines, segment ends, server corrections, substitutions,
    // challenges or annotations (§ 11.4, CA 2026-10-18)
    const types = new Set(entries.filter((e) => INPUT_MODE_TYPES.has(e.type)).map((e) => e.type));

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
    // the history's own configuration scores what follows: a record not yet written is prepared again under it
    if (this.storedScore && (state.competitionFormat || state.pointMultipliers)) this.prepareFromTimeline();
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

    if (!shouldRecalculate) {
      this.uncountedRemovals += 1;
      return;
    }

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
    this.winnerServesNext = undefined;
    this.uncountedRemovals = 0;
    this.storedScore = undefined;

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
   * Apply a set total to the current state (no entry recording), judged by its segment's rule (§ 2.3).
   * Strict, at the action boundary, a total the rule contradicts is refused before anything is written;
   * on replay an explicit winner is taken as recorded. Returns the winner the set is recorded with.
   */
  private applyAddSet(options: AddSetOptions, strict = false): 1 | 2 | undefined {
    if (this.cachedFormatStructure?.setFormat?.combinedPointTotal) {
      if (this.state.score.sets.length) throw new Error('Combined-point formats have one segment');
      const sets = [{ ...options, setNumber: 1 }];
      this.validateCombinedScore(sets);
      this.state.score.sets = sets;
      this.completeCombinedScore();
      return this.state.score.sets[0].winningSide as 1 | 2 | undefined;
    }
    const sets = this.state.score.sets;
    // A set in play (points or games already recorded in it) is the set the total closes: its score
    // becomes the declared total and its points stay on the history (§ 2.3, CA 2026-10-18). Otherwise
    // the total is the next set.
    const setNumber = openSetNumber(sets);
    const setFormat = setFormatFor(this.cachedFormatStructure, sets, setNumber);
    const judgement = judgeSetTotal(options, setFormat);
    const { winningSide, refusal } = settleSetWinner(options, judgement);
    if (refusal) {
      if (strict) throw new Error(refusal);
      this.legacyShapes.add(LEGACY_REFUSED_INPUT);
    }
    const newSet = buildJudgedSet(options, setNumber, setFormat, judgement, winningSide);
    // an unfinished tiebreak-only total is the race in play, as a baseline reads it (§ 5 rule 1, SE2a-D13)
    if (setFormat?.tiebreakSet && winningSide === undefined && !newSet.segmentComplete) openRaceInPlay(newSet);
    sets[setNumber - 1] = newSet;

    if (this.state.matchUpStatus === TO_BE_PLAYED) {
      this.state.matchUpStatus = IN_PROGRESS;
    }

    if (winningSide !== undefined || newSet.segmentComplete) {
      this.checkMatchCompletion();
    }
    return winningSide;
  }

  /**
   * Apply a game result to the current state (no entry recording)
   */
  private applyAddGame(options: AddGameOptions): void {
    const { winner, tiebreakScore } = options;

    // Get or create current set: a closed segment takes no input, so a game after one opens the next set,
    // as a point does (§ 6.4, CA 2026-10-18)
    let currentSet = this.state.score.sets.at(-1) as ClosableSet | undefined;

    if (!currentSet || currentSet.winningSide !== undefined || currentSet.segmentComplete) {
      currentSet = {
        setNumber: this.state.score.sets.length + 1,
        side1Score: 0,
        side2Score: 0,
      };
      markSet(currentSet, setFormatFor(this.cachedFormatStructure, this.state.score.sets, currentSet.setNumber));
      this.state.score.sets.push(currentSet);
    }

    if (this.state.matchUpStatus === TO_BE_PLAYED) {
      this.state.matchUpStatus = IN_PROGRESS;
    }

    // In a tiebreak-only segment a game is the segment won 1-0, its tiebreakScore the points (§ 2.2, § 5)
    const setNumber = this.state.score.sets.length;
    if (setFormatFor(this.cachedFormatStructure, this.state.score.sets, setNumber)?.tiebreakSet) {
      currentSet.side1Score = winner === 0 ? 1 : 0;
      currentSet.side2Score = winner === 0 ? 0 : 1;
      currentSet.winningSide = (winner + 1) as 1 | 2;
      if (tiebreakScore) {
        currentSet.side1TiebreakScore = tiebreakScore[0];
        currentSet.side2TiebreakScore = tiebreakScore[1];
      }
      this.checkMatchCompletion();
      return;
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

    // Check set completion
    this.checkSetCompletion(currentSet);

    // Reset point-level tracking: a game won short of the set opens the next at 0-0 for subsequent addPoint()
    // calls (the completed game's points are discarded, since addGame gives the result without point detail,
    // SE2a-D3); the game that wins the set opens none, as a point that wins it opens none (SE2a-D3b)
    const countsPoints = !!(currentSet.side1GameScores?.length || currentSet.side2GameScores?.length);
    if (countsPoints && currentSet.winningSide === undefined) {
      currentSet.side1GameScores = currentSet.side1GameScores ?? [];
      currentSet.side2GameScores = currentSet.side2GameScores ?? [];
      currentSet.side1GameScores.push(0);
      currentSet.side2GameScores.push(0);
    }

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

    const setsWon: [number, number] = [0, 0];
    this.state.score.sets.forEach((set) => {
      if (set.winningSide === 1) setsWon[0]++;
      if (set.winningSide === 2) setsWon[1]++;
    });
    const setNumber = (currentSet as any).setNumber ?? this.state.score.sets.indexOf(currentSet) + 1;
    // the set's own win is not counted yet: it is the one being judged
    const isDecidingSet = isLiveDecidingSet(formatStructure, setsWon, setNumber);
    const activeSetFormat =
      isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

    if (!activeSetFormat) return;

    const s1 = currentSet.side1Score || 0;
    const s2 = currentSet.side2Score || 0;

    // a tiebreak-only segment is won by the game itself (applyAddGame), and a timed one by its end
    if (!activeSetFormat.timed) {
      const setWon = checkStandardSetWon(s1, s2, activeSetFormat, isDecidingSet, formatStructure.finalSetFormat);
      if (typeof setWon === 'number') {
        currentSet.winningSide = setWon + 1;
      }
    }
  }

  /**
   * Check and apply match completion based on current sets
   */
  private checkMatchCompletion(matchUp: MatchUp = this.state): void {
    const formatStructure = parse(matchUp.matchUpFormat);
    if (!formatStructure) return;
    const bestOf = formatStructure.exactly || formatStructure.bestOf || 3;
    const setsToWin = Math.ceil(bestOf / 2);
    checkAndFinalizeMatch(matchUp, formatStructure, setsToWin);
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
    this.startService();

    for (const [index, entry] of entries.entries()) {
      const wasComplete = this.state.matchUpStatus === COMPLETED;
      // an entry the action boundary now refuses or ignores is replayed as v1 replayed it (§ 12.8)
      // (input past a level close is that shape already)
      const verdict = this.replayVerdict(entries, index);
      const pastLevelClose = this.legacyShapes.has(SCORING_PAST_LEVEL_CLOSE);
      if (verdict.refusal) this.legacyShapes.add(LEGACY_REFUSED_INPUT);
      else if (verdict.ignored && !pastLevelClose) this.legacyShapes.add(LEGACY_IGNORED_INPUT);
      this.replayEntry(entry, entries, index);
      this.replayLegacyShape(this.state, wasComplete, scoresAfter(entries, index));
      // a server correction attached to the entry is replayed with it (§ 2.6), as is a baseline's server, which v2
      // keeps only in the baseline's data
      const correction = entry.serverCorrection ?? (entry.type === 'setInitialScore' ? entry.data?.server : undefined);
      if (correction === 0 || correction === 1) this.applyServerCorrection(correction);
    }
  }

  private replayEntry(entry: ScoreEntry, entries: ScoreEntry[], index: number): void {
    switch (entry.type) {
      case 'point': {
        // The lineUps start from their initial snapshot and the substitutions replay in order, so
        // the players on court here are the ones who played this point.
        const activePlayers = this.activePlayersForPoint();
        const pointCount = this.state.history?.points.length || 0;
        const timeline = this.state.history!.entries;
        this.state = addPoint(this.state, this.scoredPointInput(entry.data), {
          pointMultipliers: this.pointMultipliers,
        });
        // Restore entries (addPoint may reset them since it mutates)
        this.state.history!.entries = timeline;
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
        // v1 never completed a match from its baseline: scoring after one that decides it proves v1 wrote it
        if (this.state.matchUpStatus === COMPLETED && scoresAfter(entries, index)) {
          this.state.matchUpStatus = IN_PROGRESS;
          delete this.state.winningSide;
          delete this.state.endTime;
          this.legacyShapes.add(LEGACY_IGNORED_INPUT);
        }
        break;
      case 'setServer':
        this.applyServerCorrection(entry.data.side);
        break;
      // a challenge or an annotation changes no score: kept in place (§ 2.8), as is an entry of a type the
      // engine does not know (§ 12.6)
    }
  }

  /** What the action boundary would do with a stored entry at its position on the timeline (§ 12.8). */
  private replayVerdict(entries: ScoreEntry[], index: number): Verdict {
    const { type, data } = entries[index];
    switch (type) {
      case 'point': {
        const refusal = this.pointValueRefusal(data);
        return refusal ? { refusal } : {};
      }
      case 'game':
        return this.gameVerdict(data);
      case 'set': {
        const refusal = setInputRefusal(data);
        if (refusal) return { refusal };
        const ignored = this.closedToInput();
        return ignored ? { ignored } : {};
      }
      case 'endSegment':
        return this.endSegmentVerdict(data);
      case 'setInitialScore': {
        const refusal = baselineInputRefusal(data);
        if (refusal) return { refusal };
        if (scoresAfter(entries.slice(0, index), -1)) return { refusal: 'a second baseline' };
        // v1 took this one and left out its currentGameScore, as applyInitialScore still does (SE2a-D14)
        const named = this.raceNamedTwice(data);
        return named ? { refusal: named } : {};
      }
      default:
        return {};
    }
  }

  /**
   * The matchUp with only what scoring produces started over (§ 12.1): the identity, participants and any
   * other metadata a host attached are kept as they are, since a rebuild is not a new matchUp.
   */
  private keptIdentity(): MatchUp {
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
    newState.sides ??= fresh.sides;
    newState.matchUpFormat = this.matchUpFormat;
    return newState;
  }

  private prepareRebuildState(entries: ScoreEntry[]): MatchUp {
    const savedLineUps = this.getInitialLineUps();
    const newState = this.keptIdentity();

    for (const side of newState.sides) {
      const lineUp = savedLineUps?.[side.sideNumber];
      if (lineUp) side.lineUp = lineUp.map((tc) => ({ ...tc }));
      else delete side.lineUp;
    }

    const initialServer = this.state.history?.initialServer;
    newState.history = { points: [], entries: [...entries], ...(initialServer === undefined ? {} : { initialServer }) };

    return newState;
  }

  /**
   * Orient service so `side` serves the next point: flipped exactly when it differs from the base
   * derivation here (§ 10.6). Live, and at its position on every rebuild.
   */
  private applyServerCorrection(side: number): void {
    const setType = resolveSetType(this.cachedFormatStructure!, this.setsWon(), openSetNumber(this.state.score.sets));
    const baseServer = deriveServerBase(this.state, this.cachedFormatStructure!, setType);
    this.state.serverFlip = side !== baseServer;
    if (this.competitionFormat?.serverRule === 'WINNER_SERVES')
      this.winnerServesNext = { side: side as 0 | 1, atPoint: this.state.history?.points.length ?? 0 };
  }

  /** under WINNER_SERVES, the side a correction named for the next point, until that point is played (§ 10.6) */
  private winnerServesCorrection(): 0 | 1 | undefined {
    const next = this.winnerServesNext;
    return next?.atPoint === (this.state.history?.points.length ?? 0) ? next.side : undefined;
  }

  /** a rebuild's service starts over, oriented by the match's initial server if it has one (SE3-E1) */
  private startService(): void {
    this.storedScore = undefined;
    this.winnerServesNext = undefined;
    this.uncountedRemovals = 0;
    const initialServer = this.state.history?.initialServer;
    if (initialServer === 0 || initialServer === 1) this.applyServerCorrection(initialServer);
  }

  /**
   * Rebuild state from points array (legacy, no entries)
   *
   * Creates fresh matchUp and replays all points.
   * If an initial score was set (late arrival), applies it first.
   */
  private rebuildState(): void {
    const currentPoints = this.state.history?.points ?? [];

    // Like every rebuild it keeps the identity, participants and host metadata (§ 12.1, § 12.6 item 2).
    // Without a timeline no substitution is replayed, so the lineUps on court now are kept as they are.
    let newState = this.keptIdentity();
    const initialServer = this.state.history?.initialServer;
    newState.history = { points: [], ...(initialServer === undefined ? {} : { initialServer }) };
    this.state = newState;
    this.startService();

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
   * Apply a baseline to matchUp state (§ 2.5): it replaces the score as it stands, and completes a match it
   * decides.
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
    matchUp.score.sets = this.buildBaseline(options).sets;
    matchUp.matchUpStatus = IN_PROGRESS;
    delete matchUp.winningSide;
    delete matchUp.endTime;
    this.checkMatchCompletion(matchUp);
  }

  /**
   * The sets a baseline gives, each judged by its segment's rule as addSet judges a total (§ 2.5 rule 1),
   * the final set read from the score; an unfinished last set is the set in play (rule 3). The refusal
   * says what the baseline cannot be: an unfinished set before another, an unfinished last set beside a
   * `currentSetScore`, or a winner the rule contradicts.
   */
  private buildBaseline(options: InitialScoreOptions): { sets: SetScore[]; refusal?: string } {
    const formatStructure = this.cachedFormatStructure;
    const sets: SetScore[] = [];
    let refusal: string | undefined;
    const given = options.sets ?? [];

    for (const [index, total] of given.entries()) {
      const setNumber = index + 1;
      const setFormat = setFormatFor(formatStructure, sets, setNumber);
      const judgement = judgeSetTotal(total, setFormat);
      const settled = settleSetWinner(total, judgement);
      refusal ??= settled.refusal;
      const set = buildJudgedSet(total, setNumber, setFormat, judgement, settled.winningSide);
      sets.push(set);
      if (set.winningSide !== undefined || set.segmentComplete) continue;

      if (index < given.length - 1) refusal ??= `Set ${setNumber} is not finished and is not the last set`;
      else if (options.currentSetScore) refusal ??= `Set ${setNumber} is not finished and a currentSetScore follows it`;
      // its total is the race's points: a currentGameScore names them twice (SE2a-D14, CA 2026-10-21)
      else refusal ??= this.raceNamedTwice(options);
      this.openBaselineSet(set, setFormat, options);
    }

    if (options.currentSetScore) {
      const currentSet: SetScore = {
        setNumber: sets.length + 1,
        side1Score: options.currentSetScore.side1Score,
        side2Score: options.currentSetScore.side2Score,
        side1GameScores: [options.currentGameScore?.side1Points ?? 0],
        side2GameScores: [options.currentGameScore?.side2Points ?? 0],
      };
      markSet(currentSet, setFormatFor(formatStructure, sets, currentSet.setNumber));
      sets.push(currentSet);
    }

    return { sets, refusal };
  }

  /**
   * Why a baseline names a race's points twice, if it does: an unfinished tiebreak-only last set is its race in play,
   * so a `currentGameScore` beside it is refused (SE2a-D14, CA 2026-10-21: the cleaner rule).
   */
  private raceNamedTwice(options: InitialScoreOptions): string | undefined {
    const given = options.sets ?? [];
    if (!options.currentGameScore || options.currentSetScore || !given.length) return undefined;
    const sets: ClosableSet[] = [];
    for (const [index, total] of given.entries()) {
      const setFormat = setFormatFor(this.cachedFormatStructure, sets, index + 1);
      const judgement = judgeSetTotal(total, setFormat);
      const { winningSide } = settleSetWinner(total, judgement);
      sets.push(buildJudgedSet(total, index + 1, setFormat, judgement, winningSide));
    }
    const last = sets.at(-1)!;
    const setFormat = setFormatFor(this.cachedFormatStructure, sets, last.setNumber);
    if (!setFormat?.tiebreakSet || last.winningSide !== undefined || last.segmentComplete) return undefined;
    return `Set ${last.setNumber} is a tiebreak-only set in play, and a currentGameScore names its points again`;
  }

  /**
   * An unfinished last set of a baseline as the set in play: the game in play's points, and in a
   * tiebreak-only segment its running points, which are the game in play there (§ 5 rule 1).
   */
  private openBaselineSet(
    set: SetScore,
    setFormat: SetFormatStructure | undefined,
    options: InitialScoreOptions,
  ): void {
    if (setFormat?.tiebreakSet) {
      openRaceInPlay(set);
      return;
    }
    if (set.isTimed) return;
    set.side1GameScores = [options.currentGameScore?.side1Points ?? 0];
    set.side2GameScores = [options.currentGameScore?.side2Points ?? 0];
  }
}

/**
 * An unfinished tiebreak-only set as the set in play: no game won, its total (or `points`) the race's running
 * points, which are the game in play (§ 5 rule 1).
 */
function openRaceInPlay(set: SetScore, points?: [number, number]): void {
  const race = points ?? [set.side1TiebreakScore ?? set.side1Score ?? 0, set.side2TiebreakScore ?? set.side2Score ?? 0];
  Object.assign(set, { side1Score: 0, side2Score: 0 });
  delete set.side1TiebreakScore;
  delete set.side2TiebreakScore;
  set.side1GameScores = [race[0]];
  set.side2GameScores = [race[1]];
}

// the v1/v2 differential (scoring-engine v2 plan § 2): inert unless the ScoringEngine selector is `differential`
installScoringDifferential(ScoringEngine);
