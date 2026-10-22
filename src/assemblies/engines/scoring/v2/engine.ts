import { calculateMatchStatistics } from '@Query/scoring/statistics/standalone';
import { configuredFormat, DEFAULT_MATCHUP_FORMAT, finalGoverns, takesInput } from './format';
import { toStatObjects } from '@Query/scoring/statistics/toStatObjects';
import { createContext, initialState, positionOf, serverOf, step, INVALID_FORMAT } from './reduce';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { getScoreboard } from '@Query/scoring/getScoreboard';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { getEpisodes } from '@Query/scoring/getEpisodes';
import { readChallenge, readPoint, readServer, CALCULATED_POINT_FIELDS } from './actions';
import { replayLegacy, LEGACY_IGNORED_INPUT, LEGACY_REFUSED_INPUT } from './legacy';
import { ruleInPlay, scoreOf } from './score';
import { materialize } from './record';
import { setsWon } from './decide';
import { nowIso } from '@Tools/clock';
import {
  copyLineUps,
  hasLineUps,
  initialLineUpsOf,
  substituted,
  substitutionError,
  substitutionViolations,
  type LineUps,
} from './lineUps';

// constants and types
import type { MatchStatistics, StatisticsOptions, StatObject } from '@Query/scoring/statistics/types';
import type { FormatStructure, SetFormatStructure, TeamCompetitor } from '@Types/scoring/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { PointMultiplier } from '@Types/competitionFormat';
import type { ReducerContext } from './reduce';
import type { Side, ScoringState, StepOutcome, TimelineEntry } from './types';
import type {
  AddGameOptions,
  AddPointOptions,
  AddSetOptions,
  EndSegmentOptions,
  Episode,
  GetScoreboardOptions,
  InitialScoreOptions,
  MatchUp,
  Point,
  ScoreEntry,
  ScoreResult,
  ScoringActionResult,
  SubstitutionEvent,
} from '@Types/scoring/types';
import type {
  CompetitionFormat,
  ScoringEngineOptions,
  ScoringEngineSupplementaryState,
  ScoringEventContext,
  ScoringEventHandlers,
  SubstitutionResult,
  SubstitutionViolation,
} from '../ScoringEngine';

/**
 * ScoringEngine v2 (SE2c): the public `ScoringEngine` API as a thin shell over the reducer (plan § 2).
 *
 * The score is a pure function of the configuration and the timeline (§ 12.1): every action is offered to the
 * reducer's `step`, which refuses, ignores or records it; undo, redo and the corrections are timeline operations
 * followed by a rebuild (`reduce`). The shell owns only what is not score: the timeline and the redo stack, the
 * lineUps, the event handlers and the record's identity.
 *
 * Written from the spec (`scoring-engine-spec.md`, § 2, § 11, § 12) and the API reference, not from v1's code.
 */

const SUPPLEMENTARY_STATE_VERSION = 1;
const INPUT_MODE_TYPES = new Set(['point', 'game', 'set']);
const INPUT_MODES: Record<string, 'points' | 'games' | 'sets'> = { point: 'points', game: 'games', set: 'sets' };

/** the 1-indexed spellings: calculated on every point, and a caller's input when supplied (§ 1.3, § 1.4) */
const SPELLINGS: [string, string][] = [
  ['winner', 'winningSide'],
  ['server', 'serverSideNumber'],
];

/** a JSON round trip: what crosses the boundary is never the engine's own object (S9) */
// eslint-disable-next-line no-restricted-syntax
const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** a caller's point input as the timeline records it: every field it supplied, and nothing calculated (§ 12.2) */
function recordedInput(options: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => value !== undefined && !CALCULATED_POINT_FIELDS.has(key)),
  );
}

/** the replay input of a point saved without a timeline (§ 12.6 shape 2): every field but the calculated ones */
function replayInput(point: Point): Record<string, unknown> {
  // its recorded players stay with it: a record without a timeline has no substitutions to replay (§ 12.6)
  const { winningSide: _w, serverSideNumber: _s, ...rest } = point;
  return recordedInput(rest);
}

/** a set total is recorded with the winner its rule gave it (§ 2.3 rule 1), so its entry says what it decided */
function judged(entry: ScoreEntry, after: ScoringState): ScoreEntry {
  const winningSide = after.sets.at(-1)?.winningSide;
  if (entry.type !== 'set' || !winningSide || entry.data?.winningSide !== undefined) return entry;
  return { ...entry, data: { ...entry.data, winningSide } };
}

function refusedWith(outcome: StepOutcome): never {
  const message = 'refused' in outcome ? outcome.refused.message : 'refused';
  throw new Error(message);
}

type Rebuilt = { state: ScoringState; entries: ScoreEntry[]; completedBy?: number; legacy: string[] };

export class ScoringEngineV2 {
  private matchUpFormat: string;
  private competitionFormat?: CompetitionFormat;
  private pointMultipliers: PointMultiplier[];
  private eventHandlers?: ScoringEventHandlers;
  private record: MatchUp;
  /** the timeline; undefined for a legacy point-only record until its first recorded action (§ 12.6 shape 2) */
  private entries?: ScoreEntry[];
  private redoStack: ScoreEntry[] = [];
  private initialLineUps?: LineUps;
  private lineUps?: LineUps;
  private state: ScoringState = initialState();
  private completedBy?: number;
  private legacyShapes = new Set<string>();
  /** the record is as loaded or as a non-recalculating correction left it, until the next rebuild (§ 12.4, § 12.6) */
  private stale = false;
  /** the timeline holds input v1 accepted past a close, so the match plays on as v1 played it (§ 12.8) */
  private pastClose = false;

  constructor(options: ScoringEngineOptions = {}) {
    this.competitionFormat = options.competitionFormat;
    this.matchUpFormat = options.matchUpFormat || options.competitionFormat?.matchUpFormat || DEFAULT_MATCHUP_FORMAT;
    this.pointMultipliers = options.pointMultipliers ?? options.competitionFormat?.pointMultipliers ?? [];
    this.eventHandlers = options.eventHandlers;
    this.record = createMatchUp({
      matchUpFormat: this.matchUpFormat,
      matchUpId: options.matchUpId,
      isDoubles: options.isDoubles || false,
    });
    this.entries = [];
  }

  // ===========================================================================
  // The timeline and the rebuild
  // ===========================================================================

  private context(): ReducerContext {
    const context = createContext({
      matchUpFormat: this.matchUpFormat,
      competitionFormat: this.competitionFormat as ReducerContextConfig,
      pointMultipliers: this.pointMultipliers,
    });
    if (!this.pastClose || !context.match) return context;
    return { ...context, match: { ...context.match, pastClose: true } };
  }

  private get doubles(): boolean {
    return this.record.matchUpType === 'DOUBLES';
  }

  /** the timeline a rebuild replays: the entries, or a legacy record's points as point entries (§ 12.6 shape 2) */
  private timeline(): ScoreEntry[] {
    if (this.entries) return this.entries;
    const points = this.record.history?.points ?? [];
    return points.map((point, pointIndex) => ({
      type: 'point',
      data: replayInput(point),
      timestamp: point.timestamp ?? nowIso(),
      pointIndex,
    }));
  }

  /** a fresh score with every entry replayed in order (§ 12.1) */
  /**
   * A fresh score with every entry replayed in order (§ 12.1). An entry the rules now refuse or ignore is a legacy
   * shape: replayed as v1 replayed it where v1 accepted it, kept in place otherwise, and flagged (§ 12.8).
   */
  private replay(entries: ScoreEntry[]): Rebuilt {
    this.pastClose = false;
    let context = this.context();
    let state = initialState();
    let completedBy: number | undefined;
    const legacy = new Set<string>();
    const replayed = entries.map((entry, index) => {
      const { pointIndex: _p, ...unindexed } = entry;
      const before = state;
      const result = step(context, state, unindexed as TimelineEntry);
      let next = result.state;
      if (!result.outcome.recorded) {
        const v1 = replayLegacy(context, state, unindexed as TimelineEntry, result.outcome);
        legacy.add(v1?.shape ?? ('refused' in result.outcome ? LEGACY_REFUSED_INPUT : LEGACY_IGNORED_INPUT));
        if (v1) [next, context] = [v1.state, v1.context];
      }
      if (before.matchUpStatus !== COMPLETED && next.matchUpStatus === COMPLETED) completedBy = index;
      state = next;
      return next.points.length > before.points.length
        ? { ...unindexed, pointIndex: before.points.length }
        : (unindexed as ScoreEntry);
    });
    this.pastClose = !!context.match?.pastClose;
    return { state, entries: replayed, completedBy, legacy: [...legacy] };
  }

  /** replays the timeline and writes the record from it */
  private rebuild(): void {
    const rebuilt = this.replay(this.timeline());
    this.state = rebuilt.state;
    this.completedBy = rebuilt.completedBy;
    this.legacyShapes = new Set(rebuilt.legacy);
    if (this.entries) {
      this.entries = rebuilt.entries;
      this.lineUps = lineUpsAfter(this.initialLineUps, rebuilt.entries) ?? this.lineUps;
    }
    this.stale = false;
    this.write(rebuilt.entries);
  }

  private write(entries: ScoreEntry[]): void {
    const stored = this.stale ? (this.record.history?.points ?? []) : [];
    this.record = materialize({
      base: this.record,
      state: this.state,
      entries,
      completedBy: this.completedBy,
      lineUps: { initial: this.initialLineUps, current: this.lineUps, doubles: this.doubles },
      timeline: !!this.entries,
    });
    // a record as loaded, or as a non-recalculating correction left it, keeps its points until the next rebuild:
    // new input is added to it, as calculated servers are re-derived only then (§ 12.4, § 12.6 shape 3)
    if (stored.length && this.record.history)
      this.record.history.points = [...stored, ...this.record.history.points.slice(stored.length)];
  }

  /** a legacy point-only record builds its timeline from its points on its first recorded action (§ 12.6) */
  private ensureTimeline(): void {
    if (this.entries) return;
    this.entries = this.timeline();
  }

  /**
   * Offers an action to the reducer (§ 2): refused, it throws and writes nothing; ignored, it records nothing and
   * keeps the redo stack; recorded, it goes on the timeline and clears the redo stack (§ 12.3).
   */
  private offer(entry: ScoreEntry): ScoringActionResult {
    this.ensureTimeline();
    const context = this.context();
    const before = this.state;
    const result = step(context, before, entry as TimelineEntry, true);
    if (!result.outcome.recorded) {
      if ('refused' in result.outcome) refusedWith(result.outcome);
      return { recorded: false, ignored: result.outcome.ignored } as ScoringActionResult;
    }
    const entries = this.entries as ScoreEntry[];
    const pointIndex = result.state.points.length > before.points.length ? before.points.length : undefined;
    entries.push(pointIndex === undefined ? judged(entry, result.state) : { ...entry, pointIndex });
    if (before.matchUpStatus !== COMPLETED && result.state.matchUpStatus === COMPLETED)
      this.completedBy = entries.length - 1;
    this.state = result.state;
    this.redoStack = [];
    this.write(entries);
    return { recorded: true };
  }

  // ===========================================================================
  // Events (§ 11.5)
  // ===========================================================================

  private eventContext(): ScoringEventContext {
    return { state: this.getState(), score: this.getScore() } as ScoringEventContext;
  }

  /** the scoring events of a recorded point, in order: point, game, set, then match winner or tie */
  private pointEvents(before: ScoringState): void {
    const handlers = this.eventHandlers;
    if (!handlers) return;
    const point = this.state.points.at(-1);
    if (!point) return;
    handlers.onPoint?.(this.eventContext());
    const winner = point.winner;
    if (this.completedAGame(before, point.set))
      handlers.onGameComplete?.({ ...this.eventContext(), gameWinner: winner });
    const set = this.state.sets[point.set];
    if (set?.winningSide && !before.sets[point.set]?.winningSide)
      handlers.onSetComplete?.({ ...this.eventContext(), setWinner: (set.winningSide - 1) as Side });
    this.matchEvents(before);
  }

  /** whether the last point completed a game: not in a combined total, nor a timed segment scored in units */
  private completedAGame(before: ScoringState, setIndex: number): boolean {
    const point = this.state.points.at(-1);
    const match = this.context().match;
    if (!point || !match || point.score !== '0-0') return false;
    const rule = positionOf(match, { ...before }).rule;
    if (rule.kind === 'combined') return false;
    const set = this.state.sets[setIndex];
    const timedUnits = rule.kind === 'timed' && !rule.buildsGames && !before.sets[setIndex]?.side1TiebreakScore;
    return !!set && !(timedUnits && set.side1TiebreakScore === undefined);
  }

  /** a match completed with a winner, or level (§ 9.7) */
  private matchEvents(before: ScoringState): void {
    const handlers = this.eventHandlers;
    if (!handlers || before.matchUpStatus === COMPLETED || this.state.matchUpStatus !== COMPLETED) return;
    const winningSide = this.state.winningSide;
    if (winningSide) handlers.onMatchComplete?.({ ...this.eventContext(), matchWinner: (winningSide - 1) as Side });
    else handlers.onMatchTie?.(this.eventContext());
  }

  // ===========================================================================
  // Input
  // ===========================================================================

  addPoint(options: AddPointOptions = {} as AddPointOptions): ScoringActionResult {
    const given = options as unknown as Record<string, unknown>;
    const before = this.state;
    const entry: ScoreEntry = {
      type: 'point',
      data: recordedInput(given),
      timestamp: (given.timestamp as string | undefined) ?? nowIso(),
    };
    const result = this.offer(entry);
    if (result.recorded) this.pointEvents(before);
    return result;
  }

  /** a game, a set total or a segment end: no point events, but `onMatchTie` when it ends the match level */
  private scoringInput(type: ScoreEntry['type'], data: unknown, timestamp?: string): ScoringActionResult {
    const before = this.state;
    const result = this.offer({ type, data: { ...(data as object) }, timestamp: timestamp ?? nowIso() });
    if (result.recorded && !this.state.winningSide) this.matchEvents(before);
    return result;
  }

  addGame(options: AddGameOptions): ScoringActionResult {
    return this.scoringInput('game', options);
  }

  addSet(options: AddSetOptions): ScoringActionResult {
    return this.scoringInput('set', options);
  }

  endSegment(options?: EndSegmentOptions): ScoringActionResult {
    return this.scoringInput('endSegment', options ?? {});
  }

  setInitialScore(options: InitialScoreOptions): void {
    this.scoringInput('setInitialScore', copy(options));
  }

  addChallenge(options: { sideNumber: 1 | 2; timestamp?: string; [key: string]: unknown }): void {
    const { timestamp, ...data } = options;
    const reason = readChallenge(data);
    if (reason) throw new Error(reason.message);
    this.offer({ type: 'challenge', data, timestamp: timestamp ?? nowIso() });
  }

  addAnnotation(data: Record<string, unknown>, options?: { timestamp?: string }): void {
    this.offer({ type: 'annotation', data: { ...data }, timestamp: options?.timestamp ?? nowIso() });
  }

  /**
   * A server correction (§ 2.6, § 10.6). Recorded as its own action by default; with `recordEntry: false` it is
   * attached to the entry before it and replayed and undone with it. With nothing on the timeline it orients the
   * next point only (SE3-E1). A correction that changes nothing records nothing (§ 12.3).
   */
  setServer(side: 0 | 1, options?: { recordEntry?: boolean }): void {
    const reason = readServer({ side });
    if (reason) throw new Error(reason.message);
    const context = this.context();
    if (!context.match) throw new Error(INVALID_FORMAT);
    this.ensureTimeline();
    const corrected = step(context, this.state, { type: 'setServer', data: { side } }).state;
    // it changes the orientation, not only the next server: a first correction to the side already due still fixes
    // it, so a server supplied on the first point no longer flips the derivation (§ 10.6)
    if (JSON.stringify(corrected.service) === JSON.stringify(this.state.service)) return;
    if (options?.recordEntry !== false) {
      this.offer({ type: 'setServer', data: { side }, timestamp: nowIso() });
      return;
    }
    const entries = this.entries as ScoreEntry[];
    const last = entries.at(-1);
    if (!last) {
      this.state = corrected;
      return;
    }
    entries[entries.length - 1] = { ...last, serverCorrection: side };
    this.redoStack = [];
    this.rebuild();
  }

  // ===========================================================================
  // Undo, redo and the corrections (§ 12.3, § 12.4)
  // ===========================================================================

  undo(count = 1): boolean {
    const timeline = this.timeline();
    const n = Math.min(count, timeline.length);
    if (n <= 0) return false;
    const undone = timeline.slice(timeline.length - n).reverse();
    this.redoStack.push(...undone.map(({ pointIndex: _p, ...entry }) => entry as ScoreEntry));
    if (this.entries) this.entries = timeline.slice(0, timeline.length - n);
    else
      this.record = {
        ...this.record,
        history: { ...this.record.history, points: (this.record.history?.points ?? []).slice(0, -n) },
      };
    this.rebuild();
    this.eventHandlers?.onUndo?.(this.eventContext());
    return true;
  }

  redo(count = 1): boolean {
    const n = Math.min(count, this.redoStack.length);
    if (n <= 0) return false;
    this.ensureTimeline();
    const redone = this.redoStack.splice(this.redoStack.length - n, n).reverse();
    (this.entries as ScoreEntry[]).push(...redone);
    this.rebuild();
    this.eventHandlers?.onRedo?.(this.eventContext());
    return true;
  }

  canUndo(): boolean {
    return this.getUndoDepth() > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoDepth(): number {
    return this.entries ? this.entries.length : (this.record.history?.points.length ?? 0);
  }

  getRedoDepth(): number {
    return this.redoStack.length;
  }

  private pointEntry(pointIndex: number): ScoreEntry | undefined {
    return this.entries?.find((entry) => entry.type === 'point' && entry.pointIndex === pointIndex);
  }

  /**
   * The facts a correction writes (§ 12.4): every field given, a side edited in one spelling clearing the other so
   * the replay reads the edit. Refused before anything changes when the result is not a valid point.
   */
  private corrected(pointIndex: number, given: Record<string, unknown>): Record<string, unknown> {
    const stored = this.pointEntry(pointIndex)?.data ?? replayInput((this.record.history?.points ?? [])[pointIndex]);
    const data: Record<string, unknown> = { ...stored };
    for (const [zero, one] of SPELLINGS) {
      if (given[zero] !== undefined && given[one] === undefined) delete data[one];
      if (given[one] !== undefined && given[zero] === undefined) delete data[zero];
    }
    Object.assign(data, recordedInput(given));
    const facts = readPoint(data);
    if (facts.refused) throw new Error(facts.refused.message);
    return data;
  }

  editPoint(pointIndex: number, newData: Partial<AddPointOptions>, options?: { recalculate?: boolean }): void {
    const points = this.record.history?.points ?? [];
    if (pointIndex < 0 || pointIndex >= points.length) return;
    const given = newData as Record<string, unknown>;
    const data = this.corrected(pointIndex, given);
    const entry = this.pointEntry(pointIndex);
    if (entry) entry.data = data;
    // the point carries both spellings of what was edited; a record without a timeline rebuilds from its points
    this.patchPoint(pointIndex, this.spelled({ ...points[pointIndex], ...given } as Point, given));
    if (options?.recalculate === false) {
      this.stale = true;
      return;
    }
    this.redoStack = [];
    this.rebuild();
  }

  /** a point after an edit: the spelling the edit did not give follows the one it did */
  private spelled(point: Point, given: Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = { ...point };
    if (given.winner !== undefined) fields.winningSide = (given.winner as number) + 1;
    if (given.winningSide !== undefined) fields.winner = (given.winningSide as number) - 1;
    if (given.server !== undefined) fields.serverSideNumber = (given.server as number) + 1;
    if (given.serverSideNumber !== undefined) fields.server = (given.serverSideNumber as number) - 1;
    return fields;
  }

  private patchPoint(pointIndex: number, fields: Record<string, unknown>): void {
    const points = [...(this.record.history?.points ?? [])];
    points[pointIndex] = { ...points[pointIndex], ...fields } as Point;
    this.record = { ...this.record, history: { ...this.record.history, points } };
  }

  removePoint(pointIndex: number, options?: { recalculate?: boolean }): void {
    const points = this.record.history?.points ?? [];
    if (pointIndex < 0 || pointIndex >= points.length) return;
    const kept = points.filter((_, index) => index !== pointIndex);
    if (this.entries)
      this.entries = this.entries
        .filter((entry) => !(entry.type === 'point' && entry.pointIndex === pointIndex))
        .map((entry) =>
          entry.pointIndex !== undefined && entry.pointIndex > pointIndex
            ? { ...entry, pointIndex: entry.pointIndex - 1 }
            : entry,
        );
    const history = { ...this.record.history, points: kept, ...(this.entries ? { entries: this.entries } : {}) };
    this.record = { ...this.record, history };
    if (options?.recalculate === false) {
      this.stale = true;
      return;
    }
    this.redoStack = [];
    this.rebuild();
  }

  decoratePoint(pointIndex: number, metadata: Record<string, unknown>): void {
    const points = this.record.history?.points ?? [];
    if (pointIndex < 0 || pointIndex >= points.length) return;
    const entry = this.pointEntry(pointIndex);
    if (entry) entry.data = { ...entry.data, ...recordedInput(metadata) };
    this.patchPoint(pointIndex, metadata);
  }

  /** deprecated: an annotation on the set only, discarded by the next rebuild (§ 2.9) */
  markHardBoundary(options: { setIndex: number; gameIndex: number }): void {
    const sets = this.record.score.sets.map((set, index) =>
      index === options.setIndex
        ? {
            ...set,
            hardBoundaries: [...new Set([...(set.hardBoundaries ?? []), options.gameIndex])].sort((a, b) => a - b),
          }
        : set,
    );
    this.record = { ...this.record, score: { ...this.record.score, sets } };
  }

  reset(): void {
    const { matchUpId, matchUpType } = this.record;
    this.record = createMatchUp({ matchUpFormat: this.matchUpFormat, matchUpId, matchUpType });
    this.entries = [];
    this.redoStack = [];
    this.initialLineUps = undefined;
    this.lineUps = undefined;
    this.state = initialState();
    this.completedBy = undefined;
    this.legacyShapes = new Set();
    this.stale = false;
    this.eventHandlers?.onReset?.(this.eventContext());
  }

  // ===========================================================================
  // State and persistence (§ 12.5, § 12.6)
  // ===========================================================================

  setState(matchUp: MatchUp): void {
    const loaded = copy(matchUp);
    this.record = loaded;
    this.matchUpFormat = loaded.matchUpFormat;
    this.redoStack = [];
    this.entries = loaded.history?.entries ? [...loaded.history.entries] : undefined;
    this.lineUps = lineUpsOf(loaded);
    this.initialLineUps = initialLineUpsOf(this.lineUps, this.entries, loaded.history?.substitutions);
    // loaded as stored; the reduction is ready for the next action, which rebuilds the record (§ 12.6)
    this.prepare();
    // the legacy shapes are those the last rebuild met, and none has run yet (the API's getLegacyShapes)
    this.legacyShapes = new Set();
    this.stale = true;
  }

  /**
   * The record a matchUp rebuilds to from its own timeline, as loaded with its saved configuration: what a stored
   * score should agree with (§ 12.2). The differential reads it to tell a consistent record from one that is not.
   */
  static rebuiltFrom(matchUp: MatchUp, supplementary?: ScoringEngineSupplementaryState): MatchUp {
    const engine = new ScoringEngineV2({ matchUpFormat: matchUp.matchUpFormat });
    engine.setState(matchUp);
    if (supplementary) engine.loadSupplementaryState(supplementary);
    engine.rebuild();
    return engine.getState();
  }

  /** the reduction a stored record's next action is taken on, its record left as stored */
  private prepare(): void {
    const rebuilt = this.replay(this.timeline());
    this.state = rebuilt.state;
    this.completedBy = rebuilt.completedBy;
    if (this.entries) this.entries = rebuilt.entries;
  }

  getState(): MatchUp {
    return copy(this.record);
  }

  getSupplementaryState(): ScoringEngineSupplementaryState {
    const initialLineUps = this.initialLineUps
      ? Object.fromEntries(Object.entries(this.initialLineUps).map(([side, lineUp]) => [String(side), lineUp]))
      : undefined;
    return copy({
      version: SUPPLEMENTARY_STATE_VERSION,
      redoStack: this.redoStack,
      ...(initialLineUps ? { initialLineUps } : {}),
      ...(this.competitionFormat ? { competitionFormat: this.competitionFormat } : {}),
      pointMultipliers: this.pointMultipliers,
    });
  }

  /** a version 1 envelope's configuration replaces the constructor's; a version 0 envelope carries none (§ 12.6) */
  loadSupplementaryState(supplementary: ScoringEngineSupplementaryState): void {
    const loaded = copy(supplementary);
    this.redoStack = loaded.redoStack ?? [];
    if (loaded.initialLineUps)
      this.initialLineUps = Object.fromEntries(
        Object.entries(loaded.initialLineUps).map(([side, lineUp]) => [Number(side), lineUp]),
      );
    if (loaded.version !== undefined && loaded.version >= 1) {
      this.competitionFormat = loaded.competitionFormat;
      this.pointMultipliers = loaded.pointMultipliers ?? [];
      // the history's own configuration scores what follows: the next action is taken on it
      if (this.stale) this.prepare();
    }
  }

  getLegacyShapes(): string[] {
    return [...this.legacyShapes];
  }

  // ===========================================================================
  // Views (§ 11)
  // ===========================================================================

  getScore(): ScoreResult {
    return copy(scoreOf(this.context(), this.state, this.record.score.sets));
  }

  /** a record view over the saved shape, shared with every engine (decision SE2c-D1) */
  getScoreboard(options?: GetScoreboardOptions): string {
    return getScoreboard(this.record, options);
  }

  getWinner(): number | undefined {
    return this.record.matchUpStatus === COMPLETED ? this.record.winningSide : undefined;
  }

  isComplete(): boolean {
    return this.record.matchUpStatus === COMPLETED;
  }

  getPointCount(): number {
    return this.record.history?.points.length ?? 0;
  }

  getFormat(): string {
    return this.matchUpFormat;
  }

  getStatistics(options?: StatisticsOptions): MatchStatistics {
    const points = this.record.history?.points ?? [];
    return calculateMatchStatistics(this.record, points as Parameters<typeof calculateMatchStatistics>[1], options);
  }

  getStatObjects(options?: StatisticsOptions): StatObject[] {
    return toStatObjects(this.getStatistics(options));
  }

  getEpisodes(): Episode[] {
    return getEpisodes(this.record);
  }

  getNextServer(): 0 | 1 {
    return serverOf(this.context(), this.state).side;
  }

  isServerDerived(): boolean {
    return serverOf(this.context(), this.state).derived;
  }

  getInputLevels(): { point: boolean; game: boolean; set: boolean } {
    const rule = ruleInPlay(this.context(), this.state);
    // a format that does not parse reports every level; the action itself refuses the format (§ 1.1)
    if (!rule) return { point: true, game: true, set: true };
    return { point: takesInput(rule, 'point'), game: takesInput(rule, 'game'), set: true };
  }

  getInputMode(): 'points' | 'games' | 'sets' | 'mixed' | 'none' {
    const types = new Set(
      this.timeline()
        .map((entry) => entry.type)
        .filter((type) => INPUT_MODE_TYPES.has(type)),
    );
    if (types.size === 0) return 'none';
    if (types.size > 1) return 'mixed';
    return INPUT_MODES[[...types][0]];
  }

  // ===========================================================================
  // Format introspection
  // ===========================================================================

  private structure(): FormatStructure | undefined {
    return parse(this.matchUpFormat);
  }

  getFormatStructure(): FormatStructure | undefined {
    return this.structure();
  }

  isNoAd(): boolean {
    const setFormat = this.structure()?.setFormat;
    return !!(setFormat?.NoAD || setFormat?.gameFormat?.NoAD);
  }

  getSetsToWin(): number {
    const match = this.context().match;
    return match ? match.setsToWin : 2;
  }

  getTiebreakAt(): number | null {
    const setFormat = this.structure()?.setFormat;
    if (!setFormat || setFormat.tiebreakSet) return null;
    if (!setFormat.tiebreakFormat) return null;
    const at = setFormat.tiebreakAt;
    return typeof at === 'number' ? at : (setFormat.setTo ?? null);
  }

  hasFinalSetTiebreak(): boolean {
    const structure = this.structure();
    const finalSet = structure?.finalSetFormat ?? structure?.setFormat;
    return !!finalSet?.tiebreakFormat || !!finalSet?.tiebreakSet;
  }

  getSetInPlayFormat(): SetFormatStructure | undefined {
    const structure = this.structure();
    const match = this.context().match;
    if (!structure || !match) return undefined;
    const closed = this.state.sets.filter((set) => set.winningSide || set.segmentComplete);
    const setNumber = Math.min(positionOf(match, this.state).set.setNumber, Math.max(closed.length + 1, 1));
    const final = finalGoverns(match, setNumber, setsWon(this.state.sets.slice(0, setNumber - 1)));
    return final && structure.finalSetFormat ? structure.finalSetFormat : structure.setFormat;
  }

  // ===========================================================================
  // LineUps and substitution (§ 2.7)
  // ===========================================================================

  setLineUp(sideNumber: 1 | 2, lineUp: TeamCompetitor[]): void {
    if (!(this.record.sides ?? []).some((side) => side.sideNumber === sideNumber)) return;
    const copied = lineUp.map((tc) => ({ ...tc }));
    this.lineUps = { ...(this.lineUps ?? {}), [sideNumber]: copied };
    this.initialLineUps = { ...(this.initialLineUps ?? {}), [sideNumber]: copied.map((tc) => ({ ...tc })) };
    this.record = {
      ...this.record,
      sides: (this.record.sides ?? []).map((side) =>
        side.sideNumber === sideNumber ? { ...side, lineUp: copied } : side,
      ),
    };
  }

  substitute(options: {
    sideNumber: 1 | 2;
    outParticipantId: string;
    inParticipantId: string;
    timestamp?: string;
  }): SubstitutionResult {
    const { timestamp, ...facts } = options;
    const setNumber = this.setNumberInPlay();
    const event: SubstitutionEvent = { ...facts, beforePointIndex: this.getPointCount(), setNumber };
    const error = substitutionError(this.lineUps, event);
    if (error) return { success: false, error };
    this.lineUps = substituted(this.lineUps as LineUps, event);
    this.offer({ type: 'substitution', data: event, timestamp: timestamp ?? nowIso() });
    return { success: true };
  }

  private setNumberInPlay(): number {
    const match = this.context().match;
    return match ? positionOf(match, this.state).set.setNumber : this.state.sets.length + 1;
  }

  evaluateSubstitution(): { violations: SubstitutionViolation[] } {
    const points = this.record.history?.points ?? [];
    const substitutions = this.timeline()
      .filter((entry) => entry.type === 'substitution')
      .map((entry) => entry.data as SubstitutionEvent);
    const setOf = (event: SubstitutionEvent) =>
      event.setNumber ?? ((points[event.beforePointIndex] as { set?: number } | undefined)?.set ?? -1) + 1;
    const violations = substitutionViolations(this.competitionFormat?.substitutionRules, {
      substitutions,
      setOf,
      setInPlay: this.setNumberInPlay(),
      gameHasPoints: !!this.state.game?.pointsPlayed,
      matchUpType: this.record.matchUpType,
    });
    return { violations };
  }

  getActivePlayers(): { side1: string[]; side2: string[] } {
    const ids = (side: 1 | 2) => (this.lineUps?.[side] ?? []).map((tc) => tc.participantId as string);
    return { side1: ids(1), side2: ids(2) };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  setPointMultipliers(multipliers: PointMultiplier[]): void {
    this.pointMultipliers = copy(multipliers);
  }

  getPointMultipliers(): PointMultiplier[] {
    return copy(this.pointMultipliers);
  }

  setEventHandlers(handlers: ScoringEventHandlers | undefined): void {
    this.eventHandlers = handlers;
  }

  getEventHandlers(): ScoringEventHandlers | undefined {
    return this.eventHandlers;
  }

  getPenaltyProfile() {
    return this.competitionFormat?.penaltyProfile;
  }

  getPointProfile() {
    return this.competitionFormat?.pointProfile;
  }

  getTimerProfile() {
    return this.competitionFormat?.timerProfile;
  }

  getTimeoutRules() {
    return this.competitionFormat?.timeoutRules;
  }

  getPenaltyBoxProfile() {
    return this.competitionFormat?.penaltyBoxProfile;
  }

  getSubstitutionRules() {
    return this.competitionFormat?.substitutionRules;
  }

  getPlayerRules() {
    return this.competitionFormat?.playerRules;
  }
}

type ReducerContextConfig = Parameters<typeof configuredFormat>[0]['competitionFormat'];

/** the lineUps on court after the timeline: the initial snapshot with its substitutions replayed (§ 12.1) */
function lineUpsAfter(initial: LineUps | undefined, entries: ScoreEntry[]): LineUps | undefined {
  if (!initial) return undefined;
  return entries
    .filter((entry) => entry.type === 'substitution')
    .reduce((lineUps, entry) => substituted(lineUps, entry.data as SubstitutionEvent), copyLineUps(initial) as LineUps);
}

function lineUpsOf(matchUp: MatchUp): LineUps | undefined {
  const lineUps: LineUps = {};
  for (const side of matchUp.sides ?? []) if (side.lineUp?.length) lineUps[side.sideNumber] = side.lineUp;
  return hasLineUps(lineUps) ? copyLineUps(lineUps) : undefined;
}
