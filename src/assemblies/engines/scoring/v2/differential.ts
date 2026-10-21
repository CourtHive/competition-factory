import { createContext, reduce, serverOf, step } from './reduce';
import { getScoringEngine } from '@Global/state/globalState';
import { configuredFormat, resolveFormat } from './format';

// constants and types
import type { EntryData, ScoringConfiguration, ScoringState, StepOutcome, TimelineEntry } from './types';
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SCORING_ENGINE_DIFFERENTIAL } from '@Constants/scoringEngineConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * The `differential` mode of the ScoringEngine selector: v1 acts, then v2 reduces the same configuration and
 * timeline, and any difference throws (plan § 2; the outcome pipeline's differential is the model).
 *
 * Two things are compared on every public call v1 completes:
 *
 * 1. the action boundary, for an offered action: whether v1 recorded it, ignored it (with which code) or refused
 *    it, against v2's `step` on the state before it;
 * 2. the state after it: v1's score, status, winner and materialized points (their service included), and the
 *    next server (`getNextServer`, `isServerDerived`), against `reduce(config, timeline)`.
 *
 * Every segment kind is compared (SE2b widened it from SE2a's standard and tiebreak-only). Anything it cannot yet
 * compare (legacy shapes, stale edits, records with no timeline) is DEFERRED, never passed silently, and counted by
 * reason, so a green run that compared nothing is visible.
 */

/** the v1 surface the differential reads: only the public API */
type Fields = Record<string, unknown>;
type V1State = {
  matchUpFormat?: string;
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: unknown;
  score?: { sets?: Fields[] };
  history?: { entries?: TimelineEntry[]; points?: Fields[] };
};
type V1Engine = {
  getState(): V1State;
  getSupplementaryState(): Pick<ScoringConfiguration, 'competitionFormat' | 'pointMultipliers'> | undefined;
  getLegacyShapes?(): string[];
  getFormat?(): string;
  getNextServer?(): number;
  isServerDerived?(): boolean;
};
type Method = (...args: unknown[]) => unknown;

const offer =
  (type: string) =>
  ([data]: unknown[]): TimelineEntry => ({ type, data: (data ?? {}) as EntryData });
const OFFERED: Partial<Record<string, (args: unknown[]) => TimelineEntry>> = {
  addPoint: offer('point'),
  addGame: offer('game'),
  addSet: offer('set'),
  endSegment: offer('endSegment'),
  setInitialScore: offer('setInitialScore'),
  addChallenge: offer('challenge'),
};

/** the public methods that change state, from the API reference */
export const WRAPPED_METHODS = [
  ...Object.keys(OFFERED),
  'addAnnotation',
  'setServer',
  'substitute',
  'setLineUp',
  'undo',
  'redo',
  'editPoint',
  'removePoint',
  'decoratePoint',
  'setState',
  'loadSupplementaryState',
  'reset',
  'setPointMultipliers',
  'markHardBoundary',
];

/**
 * Calls that rebuild v1's score from its timeline, ending a stale stretch: one left by `recalculate: false`, by
 * `setPointMultipliers`, which rescores nothing, or by `setState`, which loads the stored score as it is.
 */
const REBUILDS: ReadonlySet<string> = new Set(['undo', 'redo', 'reset', 'editPoint', 'removePoint']);

export class ScoringEngineDivergence extends Error {
  readonly method: string;
  readonly v1: string;
  readonly v2: string;
  constructor({ method, format, v1, v2 }: { method: string; format?: string; v1: string; v2: string }) {
    super(`scoring engine divergence after ${method} on ${format ?? '(no format)'}: v1 ${v1}, v2 ${v2}`);
    this.name = 'ScoringEngineDivergence';
    this.method = method;
    this.v1 = v1;
    this.v2 = v2;
  }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* the tally: what the differential compared and deferred, by reason. Module state on purpose: it counts across  */
/* every engine in a process, and the caller resets it.                                                          */

const tally: Record<string, number> = {};

function count(key: string): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

export function getScoringDifferentialTally(): Record<string, number> {
  return { ...tally };
}

export function resetScoringDifferentialTally(): void {
  for (const key of Object.keys(tally)) delete tally[key];
}

/* ------------------------------------------------------------------------------------------------------------ */

type Verdict = 'recorded' | `ignored:${string}` | 'refused';

function v2Verdict(outcome: StepOutcome): Verdict {
  if (outcome.recorded) return 'recorded';
  return 'ignored' in outcome ? `ignored:${outcome.ignored}` : 'refused';
}

function v1Verdict(result: unknown): Verdict {
  const { recorded, ignored } = (result ?? {}) as { recorded?: boolean; ignored?: string };
  return recorded === false && ignored ? `ignored:${ignored}` : 'recorded';
}

function configOf(engine: V1Engine, state: V1State): ScoringConfiguration {
  const supplementary = engine.getSupplementaryState() ?? {};
  const multipliers = supplementary.pointMultipliers;
  return {
    matchUpFormat: state.matchUpFormat ?? engine.getFormat?.(),
    competitionFormat: supplementary.competitionFormat,
    ...(multipliers?.length ? { pointMultipliers: multipliers } : {}),
  };
}

const SCORING_STATUSES: ReadonlySet<string> = new Set([TO_BE_PLAYED, IN_PROGRESS, COMPLETED]);

/** why this state cannot be compared yet, if it cannot */
function deferral(engine: V1Engine, state: V1State, stale: boolean): string | undefined {
  if (engine.getLegacyShapes?.().length) return 'legacy-shapes';
  if (stale) return 'stale-edit';
  if (!SCORING_STATUSES.has(state.matchUpStatus ?? '')) return 'status-outside-scoring';
  const entries = state.history?.entries;
  if (!entries) return state.score?.sets?.length || state.history?.points?.length ? 'no-timeline' : undefined;
  if (!entries.length && state.score?.sets?.length) return 'stored-score';
  return undefined;
}

const SET_FIELDS = [
  'setNumber',
  'side1Score',
  'side2Score',
  'side1TiebreakScore',
  'side2TiebreakScore',
  'winningSide',
  'side1GameScores',
  'side2GameScores',
  'isTiebreakOnly',
  'isTimed',
  'segmentComplete',
];
const POINT_FIELDS = [
  'index',
  'pointNumber',
  'winner',
  'winningSide',
  'set',
  'game',
  'number',
  'score',
  'scoreValue',
  'server',
  'serverSideNumber',
  'code',
  'serveSide',
];

const pick = (source: Fields, fields: string[]): Fields =>
  Object.fromEntries(
    fields.filter((field) => source[field] !== undefined && source[field] !== false).map((f) => [f, source[f]]),
  );

type Projection = {
  matchUpStatus: unknown;
  winningSide: unknown;
  /** the side due to serve next and whether it is derived (`getNextServer`, `isServerDerived`, § 10.4) */
  next: unknown;
  sets: Fields[];
  points: Fields[];
};

/** the part of a matchUp the reducer defines: status, winner, sets and each point's coordinates */
function projection(
  matchUpStatus: unknown,
  winningSide: unknown,
  next: unknown,
  sets: Fields[],
  points: Fields[],
): Projection {
  return {
    matchUpStatus,
    winningSide: winningSide ?? null,
    next,
    sets: sets.map((set) => pick(set, SET_FIELDS)),
    points: points.map((point) => pick(point, POINT_FIELDS)),
  };
}

type Difference = { path: string; v1: string; v2: string };

/** JSON with object keys sorted, so two projections compare by content, not by the order fields were added */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b, 'en')))
      : inner,
  );
}

/** the first path at which two projections differ, with each side's value there */
export function firstDifference(a: unknown, b: unknown, path = ''): Difference | undefined {
  if (canonical(a) === canonical(b)) return undefined;
  const leaf = typeof a !== 'object' || typeof b !== 'object' || a === null || b === null;
  const [left, right] = [a as Fields, b as Fields];
  const keys = leaf ? [] : [...new Set([...Object.keys(left), ...Object.keys(right)])];
  for (const key of keys) {
    const found = firstDifference(left[key], right[key], `${path}.${key}`);
    if (found) return found;
  }
  return { path: path || '(root)', v1: JSON.stringify(a) ?? 'undefined', v2: JSON.stringify(b) ?? 'undefined' };
}

/**
 * Differences surfaced by the differential and awaiting CA's decision (rule versus v1), each named by its decision
 * id in the SE2a hand-off. Each is narrowed to one field and one direction, and counted, so it can neither hide
 * another difference nor pass unnoticed. A decided one is removed here when v1 (or v2) is changed.
 *
 * - SE2a-D11: `isTiebreakOnly`. v2 marks every set scored by a tiebreak-only rule; v1 marks only a set a point
 *   opened under the ordinary format, not a `-F:TB{n}` match tiebreak (scored as one all the same), nor a set
 *   entered by `addGame`, `addSet` or a baseline (§ 1.2 names the mark; § 3.2: every view reads the governing format).
 * - SE2a-D3b: the per-game counts of a set closed by `addGame`. A game won short of the set opens the next game
 *   at 0-0 in both (SE2a-D3); a set closed by a point keeps no trailing entry in both; but a set closed by
 *   `addGame` keeps a trailing 0-0 in v1, a game that will never be played, and none in v2.
 * - SE2b-D11 (D11 widened): `isTimed`, likewise: v1 does not mark a timed set opened by `addGame` or `endSegment`.
 * - SE2b-D17: v1 gives a timed set scored in units (points-based, or another root) empty per-game counts (`[]`),
 *   though no game is played point by point there; v2 gives it none.
 * - SE2b-D18: a combined total's points. v1 materializes them without `index`, `set`, `game` and `number`, which
 *   § 11.1 gives every point; v2 gives them all.
 * - SE2b-D20: the point that wins a timed segment's tiebreak at time. § 11.1 shows `0-0` for a point that completes
 *   a game, as both show for a set's tiebreak; v1 shows the race's final score there (`7-0`).
 * - SE2a-D12: a point's `number` in a race scored in point values. § 11.1 counts the points played in its game
 *   before it; v1 counts their values (after an ace worth 3, the next point is `number` 3, not 1).
 */
function pendingTrailingGame(v1: Projection, v2: Projection): void {
  v2.sets.forEach((set, index) => {
    const mine = set.side1GameScores as number[] | undefined;
    const theirs = v1.sets[index] ?? {};
    const [theirs1, theirs2] = [theirs.side1GameScores, theirs.side2GameScores] as (number[] | undefined)[];
    if (!set.winningSide || !mine || !theirs1 || !theirs2 || theirs1.length !== mine.length + 1) return;
    if (theirs1.at(-1) !== 0 || theirs2.at(-1) !== 0) return;
    set.side1GameScores = [...mine, 0];
    set.side2GameScores = [...(set.side2GameScores as number[]), 0];
    count('pending:SE2a-D3b');
  });
}

function pendingNumberByValue(v1: Projection, v2: Projection): void {
  v2.points.forEach((point, index) => {
    const theirs = v1.points[index];
    if (!theirs || theirs.number === point.number) return;
    const valuesBefore = v2.points
      .slice(0, index)
      .filter((before) => before.set === point.set && before.game === point.game)
      .reduce((sum, before) => sum + ((before.scoreValue as number | undefined) ?? 1), 0);
    if (theirs.number !== valuesBefore) return;
    point.number = theirs.number;
    count('pending:SE2a-D12');
  });
}

function pendingMarks(v1: Projection, v2: Projection): void {
  v2.sets.forEach((set, index) => {
    const theirs = v1.sets[index] ?? {};
    for (const mark of ['isTiebreakOnly', 'isTimed'] as const) {
      if (!set[mark] || theirs[mark]) continue;
      delete set[mark];
      count(mark === 'isTimed' ? 'pending:SE2b-D11' : 'pending:SE2a-D11');
    }
    const empty = (value: unknown) => Array.isArray(value) && value.length === 0;
    const timed = set.isTimed !== undefined || !!theirs.isTimed;
    if (timed && set.side1GameScores === undefined && empty(theirs.side1GameScores) && empty(theirs.side2GameScores)) {
      set.side1GameScores = [];
      set.side2GameScores = [];
      count('pending:SE2b-D17');
    }
  });
}

/** SE2b-D18: v1's combined-total points carry no coordinates */
function pendingCombinedPoints(v1: Projection, v2: Projection, combined: boolean): void {
  if (!combined) return;
  v2.points.forEach((point, index) => {
    if (v1.points[index]?.index !== undefined) return;
    for (const field of ['index', 'set', 'game', 'number']) delete point[field];
    count('pending:SE2b-D18');
  });
}

/** SE2b-D20: the point that won a tiebreak at time shows the race's final score in v1 */
function pendingAtTimeScore(v1: Projection, v2: Projection): void {
  v2.points.forEach((point, index) => {
    const set = v2.sets[point.set as number];
    const theirs = v1.points[index];
    if (point.score !== '0-0' || !set?.isTimed || set.side1TiebreakScore === undefined || !theirs) return;
    if (theirs.score !== `${String(set.side1TiebreakScore)}-${String(set.side2TiebreakScore)}`) return;
    point.score = theirs.score;
    count('pending:SE2b-D20');
  });
}

/**
 * SE3-E1: a `setServer(side, { recordEntry: false })` with nothing on the timeline orients v1's next server and is
 * stored nowhere, so no reduction of the timeline can see it.
 */
function pendingUnanchoredCorrection(v1: Projection, v2: Projection, entries: TimelineEntry[]): void {
  if (entries.length || canonical(v1.next) === canonical(v2.next)) return;
  v2.next = v1.next;
  count('pending:SE3-E1');
}

function pendingDecisions(v1: Projection, v2: Projection, combined: boolean): void {
  pendingTrailingGame(v1, v2);
  pendingAtTimeScore(v1, v2);
  pendingMarks(v1, v2);
  pendingNumberByValue(v1, v2);
  pendingCombinedPoints(v1, v2, combined);
}

/** compares v1's state after a call with v2's reduction of the same timeline; throws on a difference */
export function compareStates(engine: V1Engine, method: string, stale = false, loaded = false): void {
  const state = engine.getState();
  const config = configOf(engine, state);
  const deferred = deferral(engine, state, stale);
  if (deferred) return count(`deferred:${deferred}`);
  const entries: TimelineEntry[] = state.history?.entries ?? [];
  const reduction = reduce(config, entries);
  const format = configuredFormat(config);
  // a timeline loaded by setState may hold entries an earlier engine accepted: replaying them is SE2c's (§ 12.8)
  if (reduction.legacy.length && loaded) return count('deferred:legacy-replay');
  if (reduction.legacy.length) {
    const index = reduction.legacy[0];
    const v2 = JSON.stringify(reduction.outcomes[index]);
    throw new ScoringEngineDivergence({ method, format, v1: `replays entry ${index} (${entries[index]?.type})`, v2 });
  }
  const next = serverOf(createContext(config), reduction.state);
  // an engine without the service queries is compared on its score alone
  const answers = engine.getNextServer ? { side: engine.getNextServer(), derived: engine.isServerDerived?.() } : next;
  const v1 = projection(
    state.matchUpStatus,
    state.winningSide,
    answers,
    state.score?.sets ?? [],
    state.history?.points ?? [],
  );
  const v2State: ScoringState = reduction.state;
  const v2 = projection(v2State.matchUpStatus, v2State.winningSide, next, v2State.sets, v2State.points);
  pendingDecisions(v1, v2, resolveFormat(format)?.ordinary.kind === 'combined');
  pendingUnanchoredCorrection(v1, v2, entries);
  const difference = firstDifference(v1, v2);
  if (difference)
    throw new ScoringEngineDivergence({
      method,
      format,
      v1: `${difference.path} ${difference.v1}`,
      v2: `${difference.path} ${difference.v2}`,
    });
  count(`compared:${method}`);
}

/** v2's verdict on an action offered to v1, from the state before it */
function offeredVerdict(engine: V1Engine, entry: TimelineEntry): Verdict | undefined {
  const state = engine.getState();
  const config = configOf(engine, state);
  if (deferral(engine, state, false)) return undefined;
  const context = createContext(config);
  const before = reduce(config, state.history?.entries ?? []);
  // a loaded timeline holding entries the rules now refuse is replayed as v1 replayed it: SE2c's (§ 12.8)
  if (before.legacy.length) return undefined;
  return v2Verdict(step(context, before.state, entry, true).outcome);
}

type Tracked = { depth: number; stale: boolean; loaded: boolean };
const tracked = new WeakMap<object, Tracked>();

function isStaleEdit(method: string, args: unknown[]): boolean {
  // new multipliers rescore nothing until the next rebuild (the API reference, setPointMultipliers)
  if (method === 'setPointMultipliers') return true;
  const options = { editPoint: args[2], removePoint: args[1] }[method] as { recalculate?: boolean } | undefined;
  return options?.recalculate === false;
}

function afterCall(engine: V1Engine, method: string, args: unknown[], track: Tracked): void {
  if (isStaleEdit(method, args) || method === 'setState') track.stale = true;
  else if (REBUILDS.has(method)) track.stale = false;
  if (method === 'setState') track.loaded = true;
  if (method === 'reset') track.loaded = false;
  compareStates(engine, method, track.stale, track.loaded);
}

function checkVerdict(engine: V1Engine, method: string, expected: Verdict | undefined, actual: Verdict): void {
  if (!expected) return;
  if (expected !== actual)
    throw new ScoringEngineDivergence({ method, format: engine.getFormat?.(), v1: actual, v2: expected });
  count(`verdict:${method}`);
}

function wrap(method: string, original: Method): Method {
  return function differential(this: V1Engine, ...args: unknown[]) {
    if (getScoringEngine() !== SCORING_ENGINE_DIFFERENTIAL) return original.apply(this, args);
    const track = tracked.get(this) ?? { depth: 0, stale: false, loaded: false };
    tracked.set(this, track);
    // only the outermost call compares: v1 may call its own public methods while it rebuilds
    if (track.depth > 0) return original.apply(this, args);
    const offered = OFFERED[method];
    const expected = offered && !track.stale ? offeredVerdict(this, offered(args)) : undefined;
    track.depth += 1;
    let result: unknown;
    try {
      result = original.apply(this, args);
    } catch (error) {
      track.depth -= 1;
      checkVerdict(this, method, expected, 'refused');
      throw error;
    }
    track.depth -= 1;
    checkVerdict(this, method, expected, v1Verdict(result));
    afterCall(this, method, args, track);
    return result;
  };
}

/**
 * Installs the differential on the v1 class's state-changing public methods. Inert unless the selector is
 * `differential`: a wrapped call then costs one global read.
 */
export function installScoringDifferential(engineClass: { prototype: object }): void {
  const prototype = engineClass.prototype as Record<string, unknown>;
  for (const method of WRAPPED_METHODS) {
    const original = prototype[method];
    if (typeof original === 'function') prototype[method] = wrap(method, original as Method);
  }
}
