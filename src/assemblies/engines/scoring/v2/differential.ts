import { getScoringEngine } from '@Global/state/globalState';
import { ScoringEngineV2 } from './engine';

// constants and types
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SCORING_ENGINE_DIFFERENTIAL } from '@Constants/scoringEngineConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { ScoringEngineOptions } from '../ScoringEngine';
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
  // compared since v1 counts them by § 11.2 (SE2b-D23, D25, D26; CA 2026-10-21)
  'gamesToSet',
  'pointsToSet',
  'pointsToMatch',
  'isBreakpoint',
];

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
export function compareEngines(v1Engine: Engine, v2Engine: Engine, method: string, outcomes: [Outcome, Outcome]): void {
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
  const difference = firstDifference(v1, projected);
  if (difference)
    throw new ScoringEngineDivergence({
      method,
      format,
      v1: `${difference.path} ${difference.v1}`,
      v2: `${difference.path} ${difference.v2}`,
    });
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
      compareEngines(this, companion, method, [{ threw: true }, mirror(companion, method, args)]);
      throw error;
    }
    depths.set(this, 0);
    compareEngines(this, companion, method, [v1, mirror(companion, method, args)]);
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
