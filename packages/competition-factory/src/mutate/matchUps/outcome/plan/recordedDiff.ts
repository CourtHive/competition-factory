import { DEFERRED_PAYLOAD, getCapturedStamps, getNoticeBuffer, getNoticeState } from '@Global/state/globalState';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { DRAW_CHILDREN, MATCHUP_CHILDREN, RECORDED_ENTITY, recordedName, STRUCTURE_CHILDREN } from '../ops';
import { cloneData, isPlainContainer } from '@Tools/cloneState';
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
 * ops: each matchUp it wrote (a dual's own fields, and each line's), each structure's own fields (a round robin's groups
 * are structures of their own, and a group's tally is among its fields), the draw's own fields, and the notices it
 * buffered.
 */

const ownState = (entity: object, children: string[]) =>
  Object.fromEntries(Object.entries(entity).filter(([key]) => !children.includes(key)));

/** every structure of the draw, a round robin's groups after it, in the draw's order */
export function drawStructures(drawDefinition: DrawDefinition): Structure[] {
  const found: Structure[] = [];
  const visit = (structure: Structure) => {
    found.push(structure);
    for (const child of structuresOf(structure) ?? []) visit(child);
  };
  for (const structure of drawDefinition.structures ?? []) visit(structure);
  return found;
}

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
  return { ...base, fields: asData({ ...payload, [entity]: null }) };
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
export const shapeOf = (value: unknown) =>
  JSON.stringify(value, (_key, held) => (held === undefined ? UNDEFINED : held));

/** every object under `value`, in the order its text reads them: one reached twice is listed twice */
export function objectsOf(value: unknown): object[] {
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
    matchUps: new Map(
      drawMatchUps(drawDefinition).map((stored) => [stored.matchUpId, read(ownState(stored, MATCHUP_CHILDREN))]),
    ),
    structures: new Map(
      drawStructures(drawDefinition).map((s) => [s.structureId, read(ownState(s, STRUCTURE_CHILDREN))]),
    ),
    draw: read(ownState(drawDefinition, DRAW_CHILDREN)),
    notices: new Set(getNoticeBuffer() ?? []),
  };
}

/**
 * The measure `recordedOps` takes of a change, per entity of the copy: true where the entity is unchanged since the
 * copy was read. Either from a reading taken before the run (`snapshotBaseline`), or from the stored record itself
 * (`storedBaseline`).
 */
export type RecordedBaseline = {
  unchanged: (entity: object, children: string[]) => boolean;
  notices: Set<Notice>;
};

/** the reading `readBefore` took: each entity's own fields by its id, compared as `unchanged` compares them */
export function snapshotBaseline(before: RecordedBefore): RecordedBaseline {
  const of = (entity: Record<string, unknown>, children: string[]) => {
    if (children === MATCHUP_CHILDREN) return before.matchUps.get(entity.matchUpId as string);
    if (children === STRUCTURE_CHILDREN) return before.structures.get(entity.structureId as string);
    return before.draw;
  };
  return {
    unchanged: (entity, children) =>
      unchanged(ownState(entity, children), of(entity as Record<string, unknown>, children)),
    notices: before.notices,
  };
}

type Indexable = Record<string, unknown>;

/**
 * THE STORED RECORD IS THE READING (G4, 2026-11-24). A copy made by `cloneState` reads, before anything runs on it,
 * exactly as the stored record it was made from: every plain object and array copied once, in its key order and
 * holding what it held (a key holding undefined among them), shared references kept shared, every other value held BY
 * REFERENCE. And a recording's run writes only the copy. So the stored entity an entity of the copy was made from
 * (`originals`) IS that entity as the run found it, and `readBefore`'s reading of the whole draw (two texts and two
 * object lists per entity, before and after) is not needed to say what the run changed: the copy is compared with the
 * stored record once, after the run.
 *
 * The verdict is `unchanged`'s exactly: the entity's own fields read as they did (`shapeOf`), and each object holding
 * them is the one that held it: the copy made there of the stored object (a plain object or array), or the very stored
 * value (one held by reference). First a walk that allocates nothing and answers only where it can PROVE the entity
 * unchanged (same keys in the same order, the same primitives, each object the copy of the stored one and itself
 * unchanged): what no call wrote, nearly all of a draw. Anything else is measured as `unchanged` measures it, against
 * the stored side.
 *
 * Not for a draw holding a Date (`Recording.holdsDate`): `cloneState` copies each Date where it finds it, so one Date
 * held in two places is two copies whose original is the same, and that a run swapped them could not be told. Such a
 * draw is read before the run (`snapshotBaseline`). Not for a copy written before the reading, either: the recorded
 * cascade applies its prefix first (`recordedCascade.ts`), so its copy no longer reads as the stored record.
 */
export function storedBaseline(originals: WeakMap<object, object>): RecordedBaseline {
  const { copiedFrom, sameKeys } = provingWalk(originals);
  const own = (entity: object, children: string[]) => Object.keys(entity).filter((key) => !children.includes(key));
  const measured = (state: object, storedState: object) => {
    if (shapeOf(state) !== shapeOf(storedState)) return false;
    const objects = objectsOf(state);
    const storedObjects = objectsOf(storedState);
    return objects.length === storedObjects.length && objects.every((held, at) => copiedFrom(held, storedObjects[at]));
  };
  return {
    unchanged: (entity, children) => {
      // every entity recordedOps is handed is a copy (`placed`: the run added and moved none)
      const stored = originals.get(entity);
      if (!stored) return false;
      const proved = sameKeys(entity as Indexable, stored as Indexable, own(entity, children), own(stored, children));
      return proved || measured(ownState(entity, children), ownState(stored, children));
    },
    notices: new Set(getNoticeBuffer() ?? []),
  };
}

/**
 * The walk `storedBaseline` proves with: true only where the copy's value is, place for place, what `cloneState` made
 * of the stored one and the run left it (the same keys in the same order, the same primitives, each object the copy
 * made there of the stored object, or the very value held by reference). False says only that it could not prove it.
 * `leaf`: a pair of objects, one of the copy and its stored counterpart, read as equal wherever both stand and not
 * walked (the draw, where what is outside it is compared).
 */
function provingWalk(originals: WeakMap<object, object>, leaf?: [copied: object, stored: object]) {
  // the object at a place of the copy is the one the copy held there before the run
  const copiedFrom = (held: object, stored: object) =>
    isPlainContainer(stored) ? originals.get(held) === stored : held === stored;
  const same = (held: unknown, stored: unknown): boolean => {
    if (typeof held !== 'object' || held === null) return held === stored;
    if (leaf && (held === leaf[0] || stored === leaf[1])) return held === leaf[0] && stored === leaf[1];
    if (typeof stored !== 'object' || stored === null || !copiedFrom(held, stored)) return false;
    if (!isPlainContainer(held)) return true;
    if (Array.isArray(held) && held.length !== (stored as unknown[]).length) return false;
    return sameKeys(held as Indexable, stored as Indexable, Object.keys(held), Object.keys(stored));
  };
  const sameKeys = (held: Indexable, stored: Indexable, keys: string[], storedKeys: string[]) => {
    if (keys.length !== storedKeys.length) return false;
    for (let at = 0; at < keys.length; at += 1) {
      const key = keys[at];
      if (key !== storedKeys[at] || !same(held[key], stored[key])) return false;
    }
    return true;
  };
  return { copiedFrom, same, sameKeys };
}

/**
 * Whether what the copy holds outside its draw reads as it did before the run, the text `outside` compares in
 * `recordedCall.ts` (the draw read as 0 wherever it stands), measured against the stored record the copy was made
 * from (`storedBaseline`): proved by the walk where nothing there was written, which is what a recording requires,
 * and otherwise compared as text, the copy's with the stored record's.
 */
export function outsideAsStored({
  originals,
  copied,
  stored,
}: {
  originals: WeakMap<object, object>;
  copied: { tournamentRecord?: unknown; event?: unknown; drawDefinition: object };
  stored: { tournamentRecord?: unknown; event?: unknown; drawDefinition: object };
}): boolean {
  const { same } = provingWalk(originals, [copied.drawDefinition, stored.drawDefinition]);
  if (same(copied.tournamentRecord, stored.tournamentRecord) && same(copied.event, stored.event)) return true;
  const text = ({ tournamentRecord, event, drawDefinition }: typeof copied) =>
    JSON.stringify({ tournamentRecord, event }, (_key, value) => (value === drawDefinition ? 0 : value));
  return text(copied) === text(stored);
}

/**
 * Whether the copy is, object for object, as `before` read it: every matchUp's, structure's and the draw's own fields
 * read the same and are held by the same objects (`unchanged`, the measure `recordedOps` takes of a change), and no
 * notice has been buffered since.
 */
export function nothingChanged(drawDefinition: DrawDefinition, before: RecordedBefore): boolean {
  return (
    drawMatchUps(drawDefinition).every((stored) =>
      unchanged(ownState(stored, MATCHUP_CHILDREN), before.matchUps.get(stored.matchUpId)),
    ) &&
    drawStructures(drawDefinition).every((s) =>
      unchanged(ownState(s, STRUCTURE_CHILDREN), before.structures.get(s.structureId)),
    ) &&
    unchanged(ownState(drawDefinition, DRAW_CHILDREN), before.draw) &&
    (getNoticeBuffer() ?? []).every((notice) => before.notices.has(notice))
  );
}

/**
 * An op's own copy of an entity's fields, for the working view and the shadow to fold (apply leaves the copy's own
 * graph: `Recording.mirror`). Fields that are not data (a function among the notes a caller handed `addNotes`, which
 * v1 stores as they are) are copied as far as they can be, and what cannot be copied is held by reference
 * (`cloneData`): the very function the call handed over, which is what v1 stores.
 */
const asData = cloneData;

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
  before: RecordedBaseline;
  recording: Recording;
  marks?: NoticeMarks;
}): OutcomeOp[] | undefined {
  const ops: OutcomeOp[] = [];
  const replace = (op: Extract<OutcomeOp, { recording?: Recording }>, entity: object) => {
    recording.source(recordedName(op), entity);
    ops.push(op);
  };
  // a dual's own fields, then each of its lines': a line is a matchUp of its own, and stamps as one
  for (const stored of drawMatchUps(drawDefinition)) {
    if (before.unchanged(stored, MATCHUP_CHILDREN)) continue;
    const matchUp = asData(ownState(stored, MATCHUP_CHILDREN)) as MatchUp;
    replace({ op: 'replaceMatchUp', matchUpId: stored.matchUpId, matchUp, recording }, stored);
  }
  for (const s of drawStructures(drawDefinition)) {
    if (before.unchanged(s, STRUCTURE_CHILDREN)) continue;
    const state = asData(ownState(s, STRUCTURE_CHILDREN));
    replace({ op: 'replaceStructureState', structureId: s.structureId, state, recording }, s);
  }
  if (!before.unchanged(drawDefinition, DRAW_CHILDREN)) {
    const state = asData(ownState(drawDefinition, DRAW_CHILDREN));
    replace({ op: 'replaceDrawState', drawId: drawDefinition.drawId, state, recording }, drawDefinition);
  }
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
