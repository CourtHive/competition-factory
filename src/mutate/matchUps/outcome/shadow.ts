import { announcesAssignments, eventlessNotices } from './apply';
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
