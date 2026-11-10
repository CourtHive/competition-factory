import { deferredQuery, deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { announcesAssignments, eventlessNotices, applyTemporalPhases, type TemporalPhases } from './apply';
import { getNoticeState, getTopics, getCapturedStamps } from '@Global/state/globalState';
import { appendNotice, type NoticeState } from '@Global/state/noticeIdentity';
import { observeClockReads, type ClockEffect, type ClockReading } from '@Tools/clock';
import { OutcomePipelineDivergence, recordVerificationFailure } from './differential';
import type { ResultType } from '@Types/factoryTypes';
import type { BuildViewArgs, PlanShape } from './types';
import { applyOutcomeOps, splitScoredTimeCleanup } from './ops';
import { captureRecord } from '@Tools/recordDiff';
import { generatePatch } from '@Tools/jsonPatch';
import { cloneState } from '@Tools/cloneState';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { OutcomeOp } from './ops';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * The outcome pipeline, v2: the SHADOW APPLY (executor plan § 6 S1; F7 (a)). v2 writes nothing. In `differential`, a
 * complete plan is folded into a copy of the record as it stood before v1 ran, and the copy is compared with the
 * record v1 wrote. A difference is a divergence: either the plan missed a write or v1 made one the spec does not
 * state.
 *
 * STAMPS ARE COMPARED BY VALUE. v1 stamps each entity once per call, and only the structure holding the matchUp, as
 * v2 does (F2 (i), CA 2026-10-19).
 */

type Json = Record<string, unknown>;

/** The actual draw and optional context, copied as one graph so shared references stay shared. */
export type ShadowScope = { drawDefinition: DrawDefinition; tournamentRecord?: Tournament; event?: Event };
/** Equal with the shadow-applied roots, or the first stored difference. */
export type ShadowResult =
  { equal: true; shadow: ShadowScope } | { equal: false; path: string; v1: string; v2: string };

const shown = (value: unknown) => (value === undefined ? 'absent' : JSON.stringify(value)?.slice(0, 160));

/** Copy the exact draw and real context roots together, preserving aliases without inventing a tournament. */
export function captureShadow({ drawDefinition, tournamentRecord, event }: ShadowScope): ShadowScope {
  return cloneState({ drawDefinition, tournamentRecord, event }).copy;
}

/** Fold into the captured draw, then compare every supplied root; a same-ID draw is not the passed draw. */
export function compareShadow({
  stampedBefore,
  before,
  current,
  ops,
}: {
  stampedBefore?: Set<string>;
  before: ShadowScope;
  current: ShadowScope;
  ops: OutcomeOp[];
}): ShadowResult {
  const applied = applyOutcomeOps(before.drawDefinition, ops, stampedBefore);
  if (applied.error) return { equal: false, path: '(ops)', v1: 'applied', v2: applied.error };

  // Keep the established record-path diagnostics for ordinary contained draws. Detached roots are compared too.
  const held =
    current.tournamentRecord?.events?.some((event) => event.drawDefinitions?.includes(current.drawDefinition)) &&
    (!current.event || current.tournamentRecord.events.includes(current.event));
  const roots = {
    drawDefinition: current.drawDefinition,
    tournamentRecord: current.tournamentRecord,
    event: current.event,
  };
  const v1 = JSON.parse(captureRecord(held ? current.tournamentRecord : roots)) as Json;
  const v2 = JSON.parse(captureRecord(held ? before.tournamentRecord : before)) as Json;
  const [first] = generatePatch(v2, v1);
  if (!first) return { equal: true, shadow: before };
  const at = (root: Json) =>
    first.path
      .split('/')
      .slice(1)
      .reduce<unknown>(
        (node, key) => (node as Json | undefined)?.[key.replaceAll('~1', '/').replaceAll('~0', '~')],
        root,
      );
  return { equal: false, path: first.path, v1: shown(at(v1)), v2: shown(at(v2)) };
}

/**
 * THE NOTICES a complete plan implies, by topic and key (executor plan § 3.5.5): the deduplicated buffer v1 leaves,
 * which a client's sync reads. Measured 2026-10-24 with every topic subscribed: a matchUp written or stamped is a
 * `modifyMatchUp`, the call's own matchUp an `updateInContextMatchUp`, the draw a `modifyDrawDefinition`, and a structure
 * an `assignPosition` or `assignBye` writes a `modifyPositionAssignments` keyed by structureId.
 *
 * Of the payloads, whether a `modifyMatchUp` or a `modifyPositionAssignments` names the event (S7): a key whose notice
 * names none is marked `NO_EVENT`, by the rules `applyOwnedPlan` writes it with (`eventlessNotices`). A call with no
 * event marks every event-compared notice as eventless, without inventing context. The differential passed while a
 * dual's notices differed in `eventId` (S7 item 13).
 */
export function plannedNotices({
  ops,
  matchUpId,
  hasEvent = true,
  prior,
}: {
  ops: OutcomeOp[];
  matchUpId: string;
  hasEvent?: boolean;
  prior?: { topic?: string; key?: string; payload?: { eventId?: string } }[];
}): Set<string> {
  // A satisfied double exit has an empty plan: v1 writes and announces nothing.
  if (!ops.length) return new Set();
  const { prefix, cleanup } = splitScoredTimeCleanup(ops);
  const eventless = eventlessNotices(prefix);
  for (const { matchUpId } of cleanup) eventless.matchUps.delete(matchUpId);
  // `preserveNoticeIdentity` keeps an earlier buffered event when this write supplies none.
  const retainedEvents = new Set(
    prior?.filter((notice) => notice.payload?.eventId).map((notice) => `${notice.topic}|${notice.key}`),
  );
  const marked = (topic: string, key: string, unevented: boolean) => {
    const identity = `${topic}|${key}`;
    return `${identity}${(!hasEvent || unevented) && !retainedEvents.has(identity) ? NO_EVENT : ''}`;
  };
  const notices = new Set<string>(prefix.length ? [`${UPDATE_INCONTEXT_MATCHUP}|${matchUpId}`] : []);
  for (const op of ops) {
    // every score write announces its matchUp in context, as `apply.ts` defers it: a TEAM line's dual too (S7)
    if (op.op === 'setMatchUpResult' && !op.announcedAs) notices.add(`${UPDATE_INCONTEXT_MATCHUP}|${op.matchUpId}`);
    // a placement, and a seat an unwind visits (`withdrawBye`): `apply.ts` announces each structure's assignments
    if (announcesAssignments(op))
      notices.add(marked(MODIFY_POSITION_ASSIGNMENTS, op.structureId, eventless.structures.has(op.structureId)));
    if (op.op !== 'stampUpdatedAt') continue;
    if (op.entity === 'matchUp') notices.add(marked(MODIFY_MATCHUP, op.id, eventless.matchUps.has(op.id)));
    if (op.entity === 'drawDefinition') notices.add(`${MODIFY_DRAW_DEFINITION}|${op.id}`);
  }
  return notices;
}

/**
 * The notices a call added to the buffer: every entry after it that is not one of the entries before it. Not the tail
 * past the earlier length: a notice that supersedes one already buffered under its topic and key takes the old one's
 * place at the end (`addNotice`), so the buffer does not grow, while an entry kept as it was keeps its identity. A record
 * built through engine calls whose notices were not taken (a mocks scenario) leaves such entries behind.
 */
export function addedNotices<T>(before: T[] | undefined, after: T[] | undefined): T[] {
  const kept = new Set(before ?? []);
  return (after ?? []).filter((notice) => !kept.has(notice));
}

/** a notice whose payload names no event, marked on its key where the event is compared (`plannedNotices`) */
const NO_EVENT = '|no-event';
const EVENT_COMPARED = new Set<string>([MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS]);

/**
 * what v1 added to the notice buffer in this call, deduplicated by topic and key, on the topics someone receives; a
 * `modifyMatchUp` or `modifyPositionAssignments` whose payload names no event is marked as `plannedNotices` marks it
 */
export function compareNotices({
  planned,
  added,
  topics,
}: {
  added: { topic?: string; key?: string; payload?: { eventId?: string } }[];
  planned: Set<string>;
  topics: string[];
}): { equal: true } | { equal: false; v1: string; v2: string } {
  const subscribed = new Set(topics);
  const received = (notice: string) => subscribed.has(notice.split('|')[0]);
  const keyed = (notice: (typeof added)[number]) =>
    `${notice.topic}|${notice.key}${EVENT_COMPARED.has(notice.topic ?? '') && !notice.payload?.eventId ? NO_EVENT : ''}`;
  const v1 = [...new Set(added.map(keyed))].filter(received).sort();
  const v2 = [...planned].filter(received).sort();
  if (JSON.stringify(v1) === JSON.stringify(v2)) return { equal: true };
  const only = (a: string[], b: string[]) => a.filter((notice) => !b.includes(notice)).join(', ') || 'nothing more';
  return { equal: false, v1: `notices ${only(v1, v2)}`, v2: `planned ${only(v2, v1)}` };
}

type TemporalObservation = {
  effect?: ClockEffect;
  reading: ClockReading;
  before: ReturnType<typeof temporalSnapshot>;
};

type ObservedNoticeState = NonNullable<ReturnType<typeof getNoticeState>>;

function temporalRoots(args: BuildViewArgs, state: ObservedNoticeState) {
  return {
    drawDefinition: args.drawDefinition,
    tournamentRecord: args.tournamentRecord,
    event: args.event,
    request: args.request,
    notices: state.notices,
    mutation: {
      modified: state.modified,
      disabled: state.disableNotifications,
      subscriptions: Object.fromEntries(Object.entries(state.subscriptions).map(([key, value]) => [key, !!value])),
      globalSubscriptions: { ...state.globalSubscriptions },
      modifiedTournamentIds: state.modifiedTournamentIds && [...state.modifiedTournamentIds],
      modifiedTopics: state.modifiedTopics && [...state.modifiedTopics],
    },
  };
}

function temporalSnapshot(args: BuildViewArgs, state: ObservedNoticeState) {
  return cloneTemporal(temporalRoots(args, state));
}

/**
 * Observe v1's real reads, then replay the same executor with private primitive effects. The caller's clock and
 * provider are never replaced, and a matching clock throw leaves v1's partial write intact.
 */
export function prepareTemporalShadow(args: BuildViewArgs, phases: TemporalPhases, shape: PlanShape) {
  const state = getNoticeState();
  if (!state || !args.drawDefinition) return undefined;
  const topics = getTopics().topics;
  const liveStamps = getCapturedStamps();
  let initial: ReturnType<
    typeof cloneTemporal<{ args: BuildViewArgs; phases: TemporalPhases; notices: NoticeState['notices'] }>
  >;
  try {
    initial = cloneTemporal({ args, phases, notices: state.notices });
  } catch {
    return undefined;
  }
  const privateStamps =
    liveStamps &&
    new WeakSet([...initial.copies].filter(([original]) => liveStamps.has(original)).map(([, copy]) => copy));
  const privateState: ObservedNoticeState = {
    ...state,
    notices: initial.copy.notices,
    modifiedTournamentIds: state.modifiedTournamentIds && new Set(state.modifiedTournamentIds),
    modifiedTopics: state.modifiedTopics && new Set(state.modifiedTopics),
  };
  // Plan-only allocations have no identity in v1's input. Seed only caller roots and existing buffered payloads.
  const forward = new Map<object, object>();
  const seen = new Set<object>();
  const seed = (value: unknown) => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
    seen.add(value);
    const copy = initial.copies.get(value);
    if (copy) forward.set(value, copy);
    if (typeof value === 'function') {
      seed(deferredQueryBinding(value));
      return;
    }
    if (value instanceof Map)
      for (const [key, item] of Map.prototype.entries.call(value)) {
        seed(key);
        seed(item);
      }
    if (value instanceof Set) for (const item of Set.prototype.values.call(value)) seed(item);
    for (const key of Reflect.ownKeys(value)) seed(Object.getOwnPropertyDescriptor(value, key)?.value);
  };
  for (const value of [args.drawDefinition, args.tournamentRecord, args.event, args.request, state.notices])
    seed(value);
  const reverse = new Map([...forward].map(([original, copy]) => [copy, original]));
  const current = () => {
    const noticeState = getNoticeState();
    if (!noticeState) throw new Error('notice snapshot disappeared during outcome');
    return temporalSnapshot(args, noticeState);
  };
  const mismatch = (detail: string): never => {
    throw new OutcomePipelineDivergence({
      matchUpId: args.request.matchUpId,
      v1: 'observed temporal effects',
      v2: detail,
    });
  };
  const compare = (observed: ReturnType<typeof current>) => {
    const path = temporalDifference({
      left: observed.copy,
      right: temporalRoots(initial.copy.args, privateState),
      leftOrigins: observed.originals,
      forward,
      reverse,
    });
    if (path) mismatch(`temporal state differs at ${path}`);
  };
  const observe = <T>(run: () => T): T => {
    const observations: TemporalObservation[] = [];
    const observerErrors: unknown[] = [];
    let live: T | undefined;
    let liveError: unknown;
    let liveThrew = false;
    try {
      live = observeClockReads(
        (effect) => {
          const before = current();
          return (reading) => observations.push({ effect, reading, before });
        },
        run,
        observerErrors,
      );
    } catch (error) {
      liveThrew = true;
      liveError = error;
    }
    const failed = (detail: string): never => {
      recordVerificationFailure({ matchUpId: args.request.matchUpId, occurrence: observations.length, detail });
      if (liveThrew) throw liveError;
      return mismatch(detail);
    };
    if (observerErrors.length) return failed('clock observation failed');
    try {
      const terminal = current();
      let cursor = 0;
      let replayError: unknown;
      let replayResult: ResultType | undefined;
      let replayThrew = false;
      try {
        replayResult = applyTemporalPhases(initial.copy.args, initial.copy.phases, shape, {
          topics,
          notices: {
            getCapturedStamps: () => privateStamps,
            addNotice: (notice) => appendNotice(privateState, notice, state.globalSubscriptions[notice.topic]),
            readClock: (effect) => {
              const observation = observations[cursor++];
              const observedEffect = observation?.effect;
              if (!observedEffect) return mismatch(`missing or untagged read ${cursor}`);
              if (effect.kind !== observedEffect.kind || initial.originals.get(effect.target) !== observedEffect.target)
                mismatch(`read ${cursor} kind or target differs`);
              compare(observation.before);
              if ('thrown' in observation.reading) throw observation.reading.thrown;
              if ('error' in observation.reading) throw new Error(observation.reading.message);
              return observation.reading.ms;
            },
          },
        });
      } catch (error) {
        if (error instanceof OutcomePipelineDivergence) throw error;
        replayThrew = true;
        replayError = error;
      }
      if (cursor !== observations.length) mismatch(`consumed ${cursor} of ${observations.length} reads`);
      const errorText = (error: unknown) =>
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (liveThrew !== replayThrew || (liveThrew && errorText(liveError) !== errorText(replayError)))
        mismatch('terminal return/throw differs');
      if (!liveThrew) {
        // The entry wrapper adds warnings and helper stacks after the executor. Its native parity is checked
        // separately; the executor must still return every supported semantic field, never just matching writes.
        const semantic = (result: unknown, wrapper = false) =>
          Object.fromEntries(
            Object.entries((result ?? {}) as object).filter(
              ([key]) => key !== 'stack' && !(wrapper && key === 'warnings'),
            ),
          );
        const difference = temporalDifference({
          left: semantic(live, true),
          right: semantic(replayResult),
          leftOrigins: new WeakMap(),
          forward: new Map(),
          reverse: new Map(),
        });
        if (difference) mismatch(`terminal result differs at ${difference}`);
      }
      compare(terminal);
      const afterReplay = current();
      const identity = new Map([...terminal.copies.keys()].map((original) => [original, original]));
      for (const key of ['drawDefinition', 'tournamentRecord', 'event', 'request', 'notices'] as const) {
        const leaked = temporalDifference({
          left: terminal.copy[key],
          right: afterReplay.copy[key],
          leftOrigins: terminal.originals,
          rightOrigins: afterReplay.originals,
          forward: identity,
          reverse: new Map(identity),
        });
        if (leaked) mismatch(`shadow changed live ${key} at ${leaked}`);
      }
      const mutationLeak = temporalDifference({
        left: terminal.copy.mutation,
        right: afterReplay.copy.mutation,
        leftOrigins: terminal.originals,
        rightOrigins: afterReplay.originals,
        forward: new Map(),
        reverse: new Map(),
      });
      if (mutationLeak) mismatch(`shadow changed live notice state at ${mutationLeak}`);
    } catch (error) {
      return failed(error instanceof Error ? error.message : 'temporal replay failed');
    }
    if (liveThrew) throw liveError;
    return live as T;
  };
  return Object.assign(observe, {
    shadow: {
      drawDefinition: initial.copy.args.drawDefinition!,
      tournamentRecord: initial.copy.args.tournamentRecord,
      event: initial.copy.args.event,
    },
  });
}

/** Compare immutable prefixes with one seeded bijection maintained through every clock occurrence. */
function temporalDifference({
  left,
  right,
  leftOrigins,
  rightOrigins,
  forward,
  reverse,
}: {
  left: unknown;
  right: unknown;
  leftOrigins: WeakMap<object, object>;
  rightOrigins?: WeakMap<object, object>;
  forward: Map<object, object>;
  reverse: Map<object, object>;
}): string | undefined {
  const visited = new Set<object>();
  const visit = (a: unknown, b: unknown, path: string): string | undefined => {
    if (typeof a !== typeof b) return path;
    if (!a || !b || (typeof a !== 'object' && typeof a !== 'function')) return Object.is(a, b) ? undefined : path;
    const other = b as object;
    const origin = leftOrigins.get(a) ?? a;
    const counterpart = rightOrigins?.get(other) ?? other;
    if (forward.has(origin) || reverse.has(counterpart)) {
      if (forward.get(origin) !== counterpart || reverse.get(counterpart) !== origin) return `${path}:identity`;
    } else {
      forward.set(origin, counterpart);
      reverse.set(counterpart, origin);
    }
    if (visited.has(origin)) return undefined;
    visited.add(origin);
    if (typeof a === 'function') {
      if (a === b) return undefined;
      const leftBinding = deferredQueryBinding(a),
        rightBinding = deferredQueryBinding(other);
      if (!leftBinding || !rightBinding) return `${path}:unbound-function`;
      return visit(leftBinding, rightBinding, `${path}:binding`);
    }
    if (
      (a instanceof Date || b instanceof Date) &&
      (!(a instanceof Date && b instanceof Date) ||
        !Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b)))
    )
      return path;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path}:prototype`;
    const members = (value: object): unknown[] => {
      if (value instanceof Set) return [...Set.prototype.values.call(value)];
      if (value instanceof Map) return [...Map.prototype.entries.call(value)].flatMap(([key, item]) => [key, item]);
      return [];
    };
    const leftMembers = members(a),
      rightMembers = members(other);
    if (leftMembers.length !== rightMembers.length) return `${path}:size`;
    for (let i = 0; i < leftMembers.length; i++) {
      const found = visit(leftMembers[i], rightMembers[i], `${path}:member/${i}`);
      if (found) return found;
    }
    const keys = Reflect.ownKeys(a),
      otherKeys = Reflect.ownKeys(other);
    if (keys.length !== otherKeys.length || keys.some((key, index) => key !== otherKeys[index])) return `${path}:keys`;
    for (const key of keys) {
      const found = visit(Reflect.get(a, key), Reflect.get(other, key), `${path}/${String(key)}`);
      if (found) return found;
    }
    return undefined;
  };
  return visit(left, right, '/');
}

/** Bounded replay copy: no accessors or opaque mutable values, with Date/Set/Map aliases preserved. */
function cloneTemporal<T>(root: T) {
  const copies = new Map<object, object>();
  const originals = new WeakMap<object, object>();
  const clone = (value: unknown): unknown => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
    if (copies.has(value)) return copies.get(value);
    if (typeof value === 'function') {
      const binding = deferredQueryBinding(value);
      if (!binding) {
        copies.set(value, value);
        originals.set(value, value);
        return value;
      }
      const copy = deferredQuery(binding.query, undefined);
      copies.set(value, copy);
      originals.set(copy, value);
      const rebound = deferredQueryBinding(copy)!;
      copies.set(binding, rebound);
      originals.set(rebound, binding);
      rebound.args = clone(binding.args);
      return copy;
    }
    const prototype = Object.getPrototypeOf(value);
    if (
      (value instanceof Date && prototype !== Date.prototype) ||
      (value instanceof Set && prototype !== Set.prototype) ||
      (value instanceof Map && prototype !== Map.prototype)
    )
      throw new Error('opaque temporal replay subtype');
    let copy: object;
    if (value instanceof Date) copy = new Date(Date.prototype.getTime.call(value));
    else if (value instanceof Set) copy = new Set();
    else if (value instanceof Map) copy = new Map();
    else if (Array.isArray(value)) copy = [];
    else if (prototype === Object.prototype || prototype === null) copy = Object.create(prototype);
    else throw new Error('opaque temporal replay value');
    copies.set(value, copy);
    originals.set(copy, value);
    if (value instanceof Set)
      for (const item of Set.prototype.values.call(value)) (copy as Set<unknown>).add(clone(item));
    if (value instanceof Map)
      for (const [key, item] of Map.prototype.entries.call(value))
        (copy as Map<unknown, unknown>).set(clone(key), clone(item));
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new Error('accessor in temporal replay value');
      Object.defineProperty(copy, key, { ...descriptor, value: clone(descriptor.value) });
    }
    return copy;
  };
  return { copy: clone(root) as T, copies, originals };
}
