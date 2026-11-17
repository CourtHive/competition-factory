import { DEFERRED_PAYLOAD, getCapturedStamps, getNoticeBuffer, getNoticeState } from '@Global/state/globalState';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { DRAW_CHILDREN, RECORDED_ENTITY, recordedName, STRUCTURE_CHILDREN } from '../ops';
import { isObject } from '@Tools/objects';

// constants and types
import type { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import type { Notice } from '@Global/state/globalState';
import type { OutcomeOp, RecordedNotice } from '../ops';
import type { Recording } from '../recording';

/**
 * RECORDED (CA, 2026-11-16): what the two recorders share (`recordedCascade.ts`, `recordedCall.ts`). v1's writers run on
 * a COPY of the record; what the copy held before is read here, and what the run changed is returned as the recorded
 * ops: each matchUp it wrote, each top-level structure's and the draw's own fields, and the notices it buffered.
 */

const ownState = (entity: object, children: string[]) =>
  Object.fromEntries(Object.entries(entity).filter(([key]) => !children.includes(key)));

/** every stored matchUp of the draw, a dual's lines after it, in the draw's order */
export function drawMatchUps(drawDefinition: DrawDefinition): MatchUp[] {
  const found: MatchUp[] = [];
  const visit = (structure: Structure) => {
    for (const matchUp of matchUpsOf(structure) ?? []) found.push(matchUp, ...(matchUp.tieMatchUps ?? []));
    for (const child of structuresOf(structure) ?? []) visit(child);
  };
  for (const structure of drawDefinition.structures ?? []) visit(structure);
  return found;
}

type NoticeMarks = { tournamentIds: string[]; topics: string[] };

/**
 * `withDraftWrites` puts back the notice buffer and the modified flag; the provider's marks of WHICH tournaments and
 * topics the call modified are put back here, in their order. A copy's notices marked them before the call's own did.
 * They are emptied for the run, so `fn` can read what the copy's writes marked (`read`), which apply marks again.
 */
export function withNoticeMarks<T>(fn: (read: () => NoticeMarks | undefined) => T): T {
  const sets = () => {
    const state = getNoticeState();
    return [state?.modifiedTournamentIds, state?.modifiedTopics];
  };
  const before = sets().map((set) => set && [...set]);
  sets().forEach((set) => set?.clear());
  const read = () => {
    const [tournamentIds, topics] = sets();
    return tournamentIds && topics ? { tournamentIds: [...tournamentIds], topics: [...topics] } : undefined;
  };
  try {
    return fn(read);
  } finally {
    sets().forEach((set, at) => {
      set?.clear();
      for (const value of before[at] ?? []) set?.add(value);
    });
  }
}

function recordedNotice({ topic, key, payload }: Notice): RecordedNotice | undefined {
  if (!key || !isObject(payload)) return undefined;
  const base = { topic, key, eventId: payload.eventId, context: payload.context };
  if (topic === UPDATE_INCONTEXT_MATCHUP) {
    const built = payload[DEFERRED_PAYLOAD];
    const outer = typeof built === 'function' ? deferredQueryBinding(built) : undefined;
    const bound = outer?.args as { inContextMatchUp?: object; tournamentId?: string } | undefined;
    const inner = bound?.inContextMatchUp && deferredQueryBinding(bound.inContextMatchUp);
    if (!bound || !inner) return undefined;
    const contextless = !(inner.args as { tournamentRecord?: unknown }).tournamentRecord;
    return {
      ...base,
      fields: { tournamentId: payload.tournamentId },
      deferred: { tournamentId: bound.tournamentId, contextless },
    };
  }
  const entity = RECORDED_ENTITY[topic];
  if (!entity) return undefined;
  return { ...base, fields: structuredClone({ ...payload, [entity]: null }) };
}

/**
 * the copies of what this engine call already stamped are stamped: a writer's own notices stamp once per call
 * (`stampedBefore`: `stampedInThisCall` of the stored draw)
 */
export function stampCopies(drawDefinition: DrawDefinition, stampedBefore: Set<string>) {
  const ledger = getCapturedStamps();
  if (!ledger) return;
  if (stampedBefore.has(`drawDefinition:${drawDefinition.drawId}`)) ledger.add(drawDefinition);
  for (const structure of drawDefinition.structures ?? [])
    if (stampedBefore.has(`structure:${structure.structureId}`)) ledger.add(structure);
  for (const matchUp of drawMatchUps(drawDefinition))
    if (stampedBefore.has(`matchUp:${matchUp.matchUpId}`)) ledger.add(matchUp);
}

/**
 * An entity as text for comparison, a key holding undefined included: v1 writes `winningSide: undefined` onto a matchUp
 * it resets, plain JSON drops the key, and the exact graph v1 leaves has it.
 */
const UNDEFINED = '\u0000undefined';
const shapeOf = (value: unknown) => JSON.stringify(value, (_key, held) => (held === undefined ? UNDEFINED : held));

/** every object under `value`, in the order its text reads them: one reached twice is listed twice */
function objectsOf(value: unknown): object[] {
  const found: object[] = [];
  const visit = (held: unknown) => {
    if (!held || typeof held !== 'object') return;
    found.push(held);
    for (const child of Object.values(held)) visit(child);
  };
  for (const child of Object.values(value as object)) visit(child);
  return found;
}

/**
 * An entity's own fields as the writers find them: their text, and the objects that hold them. v1 writes a NEW object
 * where the old one says the same (`removeDirectedLoser` derives a loser target's status codes afresh, an empty array
 * for an empty array): the text is the same, and the stored matchUp no longer shares the array it shared (the cleared
 * fixture's, held by every matchUp cleared with it). The exact graph v1 leaves has the new object.
 */
type Read = { shape: string; objects: object[] };
const read = (state: object): Read => ({ shape: shapeOf(state), objects: objectsOf(state) });

/** whether `state` reads as it did and is held by the objects that held it */
function unchanged(state: object, before?: Read): boolean {
  if (shapeOf(state) !== before?.shape) return false;
  const objects = objectsOf(state);
  return objects.length === before.objects.length && objects.every((held, at) => held === before.objects[at]);
}

/** the copy as the writers are about to find it: each entity's own fields, and the notices already buffered */
export type RecordedBefore = ReturnType<typeof readBefore>;
export function readBefore(drawDefinition: DrawDefinition) {
  return {
    matchUps: new Map(drawMatchUps(drawDefinition).map((stored) => [stored.matchUpId, read(stored)])),
    structures: new Map(
      (drawDefinition.structures ?? []).map((s) => [s.structureId, read(ownState(s, STRUCTURE_CHILDREN))]),
    ),
    draw: read(ownState(drawDefinition, DRAW_CHILDREN)),
    notices: new Set(getNoticeBuffer() ?? []),
  };
}

/**
 * What the writers changed on the copy since `before`, as ops, and the notices they buffered: an entity is changed
 * where its fields read differently or an object holding them is another (`unchanged`). Undefined where one of those
 * notices is one apply could not raise again on the stored record: the call stays v1's.
 */
export function recordedOps({
  drawDefinition,
  recording,
  before,
  marks,
}: {
  drawDefinition: DrawDefinition;
  before: RecordedBefore;
  recording: Recording;
  marks?: NoticeMarks;
}): OutcomeOp[] | undefined {
  const ops: OutcomeOp[] = [];
  const replace = (op: Extract<OutcomeOp, { recording?: Recording }>, entity: object) => {
    recording.source(recordedName(op), entity);
    ops.push(op);
  };
  for (const stored of drawMatchUps(drawDefinition))
    if (!unchanged(stored, before.matchUps.get(stored.matchUpId)))
      replace(
        { op: 'replaceMatchUp', matchUpId: stored.matchUpId, matchUp: structuredClone(stored), recording },
        stored,
      );
  for (const s of drawDefinition.structures ?? []) {
    const state = ownState(s, STRUCTURE_CHILDREN);
    if (!unchanged(state, before.structures.get(s.structureId)))
      replace({ op: 'replaceStructureState', structureId: s.structureId, state: structuredClone(state), recording }, s);
  }
  const state = ownState(drawDefinition, DRAW_CHILDREN);
  if (!unchanged(state, before.draw))
    replace(
      { op: 'replaceDrawState', drawId: drawDefinition.drawId, state: structuredClone(state), recording },
      drawDefinition,
    );
  const notices: RecordedNotice[] = [];
  for (const notice of getNoticeBuffer() ?? []) {
    if (before.notices.has(notice)) continue;
    const recorded = recordedNotice(notice);
    if (!recorded) return undefined;
    notices.push(recorded);
  }
  ops.push({ op: 'announceRecorded', notices, marks });
  return ops;
}
