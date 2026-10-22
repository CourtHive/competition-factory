import { getScoringEngine } from '@Global/state/globalState';
import { ScoringEngineV2 } from './engine';

// constants and types
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SCORING_ENGINE_DIFFERENTIAL } from '@Constants/scoringEngineConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { ScoringEngineOptions, ScoringEngineSupplementaryState } from '../ScoringEngine';
import type { MatchUp } from '@Types/scoring/types';
import type { ScoringConfiguration } from './types';

/**
 * The `differential` mode of the ScoringEngine selector: v1 and v2 both run every call, and any difference throws
 * (plan § 2; the outcome pipeline's differential is the model).
 *
 * Each v1 engine gets a v2 engine shell beside it (`engine.ts`, SE2c), built from v1's public surface at the first
 * call the differential sees, and every state-changing public call v1 takes is made on the shell too, with its own
 * copy of the arguments. After each call two things are compared:
 *
 * 1. what the call did: refused (thrown), recorded, or ignored with which code; `undo`/`redo`'s answer; a
 *    substitution's result;
 * 2. the state after it: status, winner, sets and materialized points (their service included), the next server
 *    (`getNextServer`, `isServerDerived`) and the legacy shapes the last rebuild met (§ 12.8).
 *
 * Because the shell keeps its own record, nothing is deferred for being loaded, stale, legacy or without a
 * timeline: a stored record, a `recalculate: false` edit and a legacy replay are all compared as they stand. A
 * status set outside scoring (`RETIRED` and the like) is not scoring's to compare, and is counted as deferred.
 */

/** the engine surface the differential reads and drives: only the public API */
type Fields = Record<string, unknown>;
type V1State = {
  matchUpId?: string;
  matchUpType?: string;
  matchUpFormat?: string;
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: unknown;
  score?: { sets?: Fields[] };
  history?: { entries?: Fields[]; points?: Fields[] };
};
type Engine = {
  getState(): V1State;
  getSupplementaryState(): Pick<ScoringConfiguration, 'competitionFormat' | 'pointMultipliers'> | undefined;
  getLegacyShapes?(): string[];
  getFormat?(): string;
  getNextServer?(): number;
  isServerDerived?(): boolean;
  setState?(state: V1State): void;
  loadSupplementaryState?(state: unknown): void;
};
type Method = (...args: unknown[]) => unknown;

/** the actions offered at the boundary, whose result says whether they were recorded or ignored (§ 2) */
const OFFERED: Readonly<Record<string, true>> = {
  addPoint: true,
  addGame: true,
  addSet: true,
  endSegment: true,
  setInitialScore: true,
  addChallenge: true,
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
    thrown.push(this.message);
  }
}

/**
 * Every divergence thrown and not yet taken. A divergence is an ordinary throw, so a caller that catches throws hides
 * it: the corpus harness records any throw as a refusal, and a bare `toThrow()` accepts one. The test setup takes
 * them after every test and fails the test that left one (`setScoringEngine.ts`), wherever it was caught.
 */
const thrown: string[] = [];

export function takeScoringDivergences(): string[] {
  return thrown.splice(0);
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

function v1Verdict(result: unknown): Verdict {
  const { recorded, ignored } = (result ?? {}) as { recorded?: boolean; ignored?: string };
  return recorded === false && ignored ? `ignored:${ignored}` : 'recorded';
}

const SCORING_STATUSES: ReadonlySet<string> = new Set([TO_BE_PLAYED, IN_PROGRESS, COMPLETED]);

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
  'pointsToGame',
  'isBreakpoint',
];

/**
 * Point views not compared until CA rules (SE2b-D23, D25, D26), counted on every comparison that skips them. v1's
 * `gamesToSet` does not follow the set's rule (at 4-5 in a tiebreak set it says 2 games; at 5-6 in an advantage set
 * 2, where 3 are needed; at 1-0 in the one-game set 1 for the side behind, where 2 are), its later sets ignore the
 * final-set format, and in an aggregate's decider it reports 0 points to the match. `pointsToSet` and
 * `pointsToMatch` are built on those. v2 computes all three to the spec (§ 11.2), held there by its own tests; the
 * differential does not reverse-engineer v1's arithmetic to excuse it.
 */
const UNCOMPARED_VIEWS = ['gamesToSet', 'pointsToSet', 'pointsToMatch'];

const pick = (source: Fields, fields: string[]): Fields =>
  Object.fromEntries(
    fields.filter((field) => source[field] !== undefined && source[field] !== false).map((f) => [f, source[f]]),
  );

type Projection = {
  /** the legacy shapes the last rebuild met (§ 12.8), sorted */
  legacy?: string[];
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
 * another difference nor pass unnoticed. A decided one is removed here when v1 (or v2) is changed: D11, D17, D18,
 * D20 and D24 were (CA 2026-10-21), with v1 brought to the rule.
 *
 * - SE2a-D3b: the per-game counts of a set closed by `addGame`. A game won short of the set opens the next game
 *   at 0-0 in both (SE2a-D3); a set closed by a point keeps no trailing entry in both; but a set closed by
 *   `addGame` keeps a trailing 0-0 in v1, a game that will never be played, and none in v2.
 * - SE2a-D12: a point's `number` in a race scored in point values. § 11.1 counts the points played in its game
 *   before it; v1 counts their values (after an ace worth 3, the next point is `number` 3, not 1).
 *
 * D23, D25 and D26 are views not compared at all: `UNCOMPARED_VIEWS`.
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

function pendingDecisions(v1: Projection, v2: Projection): void {
  pendingTrailingGame(v1, v2);
  pendingNumberByValue(v1, v2);
}

/** what a call did: its result, or that it threw; a crash (not a refusal) is kept apart, with its message */
type Outcome = { threw: boolean; result?: unknown; crash?: string };

const CRASHES = [TypeError, ReferenceError, RangeError];

/** the calls whose result the API defines beyond the offered actions': undo and redo's answer, a substitution's */
const ANSWERING: ReadonlySet<string> = new Set(['undo', 'redo', 'substitute']);

/** what a call did, as the API reports it: refused (thrown), or its result (§ 2, § 12.3) */
function outcomeVerdict(method: string, outcome: Outcome): string {
  if (outcome.threw) return 'refused';
  if (OFFERED[method]) return v1Verdict(outcome.result);
  return ANSWERING.has(method) ? canonical(outcome.result ?? null) : 'done';
}

/** calls after which v1's record is rebuilt from its timeline, no longer as it was loaded */
const REBUILDS: ReadonlySet<string> = new Set(['undo', 'redo', 'reset', 'editPoint', 'removePoint']);

function rebuilds(method: string, args: unknown[]): boolean {
  const options = { editPoint: args[2], removePoint: args[1] }[method] as { recalculate?: boolean } | undefined;
  return REBUILDS.has(method) && options?.recalculate !== false;
}

/**
 * SE2c-D3: a loaded record whose stored score disagrees with its own timeline. Until its next rebuild, v1 goes on
 * from the stored score (input scored on it, the next server derived from it) and v2 from the timeline, which is
 * authoritative (§ 12.2). Recognised only for a record the differential found inconsistent when it was loaded, and
 * only until a rebuild; for a consistent record, only the next server is excused, and only while it is as stored.
 */
function pendingStoredScore(v1: Projection, v2: Projection, loaded: Loaded | undefined): Projection {
  if (!loaded) return v2;
  if (loaded.inconsistent && canonical(v1) !== canonical(v2)) {
    count('pending:SE2c-D3');
    return v1;
  }
  if (canonical(v1.next) === canonical(v2.next)) return v2;
  count('pending:SE2c-D3');
  return { ...v2, next: v1.next };
}

function stateProjection(engine: Engine, state: V1State): Projection {
  // an engine without the service queries is compared on its score alone
  const next = engine.getNextServer ? { side: engine.getNextServer(), derived: engine.isServerDerived?.() } : null;
  const shapes = [...(engine.getLegacyShapes?.() ?? [])].sort((a, b) => a.localeCompare(b, 'en'));
  return {
    ...projection(state.matchUpStatus, state.winningSide, next, state.score?.sets ?? [], state.history?.points ?? []),
    legacy: shapes,
  };
}

/**
 * Compares v1 with its v2 shell after a call: what the call did, then the state (status, winner, sets, points and
 * their service) and the next server; throws on a difference.
 */
export function compareEngines(
  v1Engine: Engine,
  v2Engine: Engine,
  method: string,
  outcomes: [Outcome, Outcome],
  loaded?: Loaded,
): void {
  const format = v1Engine.getFormat?.();
  const crash = outcomes[1].crash;
  if (crash) throw new ScoringEngineDivergence({ method, format, v1: 'ran', v2: `crashed: ${crash}` });
  const [mine, theirs] = outcomes.map((outcome) => outcomeVerdict(method, outcome));
  if (mine !== theirs) throw new ScoringEngineDivergence({ method, format, v1: mine, v2: theirs });
  if (OFFERED[method]) count(`verdict:${method}`);
  const v1State = v1Engine.getState();
  if (!SCORING_STATUSES.has(v1State.matchUpStatus ?? '')) return count('deferred:status-outside-scoring');
  const v1 = stateProjection(v1Engine, v1State);
  const v2State = v2Engine.getState();
  const projected = stateProjection(v2Engine, v2State);
  // an engine without the service queries is compared on its score alone
  if (!v1Engine.getNextServer) projected.next = null;
  pendingDecisions(v1, projected);
  const v2 = pendingStoredScore(v1, projected, loaded);
  const difference = firstDifference(v1, v2);
  if (difference)
    throw new ScoringEngineDivergence({
      method,
      format,
      v1: `${difference.path} ${difference.v1}`,
      v2: `${difference.path} ${difference.v2}`,
    });
  const points = (v2State.history?.points ?? []) as Fields[];
  if (points.some((point) => UNCOMPARED_VIEWS.some((view) => point[view] !== undefined)))
    count('uncompared:SE2b-D23-D25-D26');
  count(`compared:${method}`);
}

/**
 * The v2 shell beside a v1 engine, from v1's public surface at the first call the differential sees: its format,
 * its saved configuration, its identity and, when it holds a score, its record.
 */
function companionOf(engine: Engine): Engine {
  const existing = companions.get(engine);
  if (existing) return existing;
  const state = engine.getState();
  const supplementary = engine.getSupplementaryState() ?? {};
  const companion = new ScoringEngineV2({
    matchUpFormat: engine.getFormat?.() ?? state.matchUpFormat,
    competitionFormat: supplementary.competitionFormat as ScoringEngineOptions['competitionFormat'],
    pointMultipliers: supplementary.pointMultipliers,
    isDoubles: state.matchUpType === 'DOUBLES',
    matchUpId: state.matchUpId,
  }) as unknown as Engine;
  if (state.history || state.score?.sets?.length) {
    companion.setState?.(state);
    companion.loadSupplementaryState?.(supplementary);
  }
  companions.set(engine, companion);
  return companion;
}

/** the same call on the v2 shell, with its own copy of the arguments */
function mirror(companion: Engine, method: string, args: unknown[]): Outcome {
  const call = (companion as unknown as Record<string, Method>)[method];
  // a JSON round trip, as the engines copy at their boundary: neither engine shares the caller's objects
  // eslint-disable-next-line no-restricted-syntax
  const copied = args.map((arg) => (arg === undefined ? arg : JSON.parse(JSON.stringify(arg))));
  try {
    return { threw: false, result: call.apply(companion, copied) };
  } catch (error) {
    const crashed = CRASHES.some((kind) => error instanceof kind);
    return { threw: true, ...(crashed ? { crash: String(error) } : {}) };
  }
}

const depths = new WeakMap<object, number>();
const companions = new WeakMap<object, Engine>();
/** a record as loaded, until a rebuild: whether it disagreed with its own timeline when it was loaded */
type Loaded = { inconsistent: boolean };
const loadedRecords = new WeakMap<object, Loaded>();

/** whether a loaded record's score is the one its timeline rebuilds to (§ 12.2) */
function consistent(engine: Engine): boolean {
  const state = engine.getState() as unknown as MatchUp;
  if (!state.history?.entries) return true;
  const supplementary = engine.getSupplementaryState() as ScoringEngineSupplementaryState | undefined;
  const rebuilt = ScoringEngineV2.rebuiltFrom(state, supplementary);
  const sets = (record: MatchUp) => (record.score?.sets ?? []).map((set) => pick({ ...set }, SET_FIELDS));
  return canonical(sets(state)) === canonical(sets(rebuilt));
}

function track(engine: Engine, method: string, args: unknown[]): Loaded | undefined {
  if (method === 'setState') loadedRecords.set(engine, { inconsistent: !consistent(engine) });
  else if (rebuilds(method, args)) loadedRecords.delete(engine);
  return loadedRecords.get(engine);
}

function wrap(method: string, original: Method): Method {
  return function differential(this: Engine, ...args: unknown[]) {
    if (getScoringEngine() !== SCORING_ENGINE_DIFFERENTIAL) return original.apply(this, args);
    // only the outermost call compares: v1 may call its own public methods while it rebuilds
    const depth = depths.get(this) ?? 0;
    if (depth > 0) return original.apply(this, args);
    const companion = companionOf(this);
    depths.set(this, 1);
    let v1: Outcome;
    try {
      v1 = { threw: false, result: original.apply(this, args) };
    } catch (error) {
      depths.set(this, 0);
      const loaded = loadedRecords.get(this);
      compareEngines(this, companion, method, [{ threw: true }, mirror(companion, method, args)], loaded);
      throw error;
    }
    depths.set(this, 0);
    const loaded = track(this, method, args);
    compareEngines(this, companion, method, [v1, mirror(companion, method, args)], loaded);
    return v1.result;
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
