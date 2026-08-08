/**
 * Notice-conformance harness (Workstream D-core scaffold).
 *
 * North-star invariant: an external query table driven by the notice stream must
 * always equal a direct re-query (rebuild) of the tournamentRecord. This harness
 * provides the primitives to assert that per mutation:
 *
 *   (ii) COMPLETENESS  — every entity that changed in the record is covered by a
 *        notice whose topic is legitimate for that entity kind + change
 *        (`conformanceViolations`). Catches silent mutations (the missing-notice
 *        class: setDelegatedOutcome, setEventDates, entries, …).
 *   (i)  FIDELITY      — the delta applied to the `cast()` read-model rows matches
 *        the rebuild diff of `cast()` before vs after (`castDiff`). Catches a
 *        notice that fires but carries the wrong payload for the projected rows.
 *
 * This is a scaffold: the entity model + spec cover the main kinds and the two
 * representative spec cases (a covered mutation + a known gap). The full ~640-method
 * catalog sweep is the follow-on (Workstream D-scenarios).
 */
import { setSubscriptions, deleteNotices } from '@Global/state/globalState';
import { cast } from '@Query/readModel/cast';

// constants and types
import {
  ADD_DRAW_DEFINITION,
  ADD_EVENT,
  ADD_MATCHUPS,
  ADD_PARTICIPANTS,
  ADD_VENUE,
  DELETE_EVENT,
  DELETE_VENUE,
  MODIFY_VENUE,
  DELETED_DRAW_IDS,
  DELETED_MATCHUP_IDS,
  DELETE_PARTICIPANTS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_DRAW_ENTRIES,
  MODIFY_EVENT,
  MODIFY_EVENT_ENTRIES,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_SEED_ASSIGNMENTS,
  MODIFY_PARTICIPANTS,
  MODIFY_TOURNAMENT_DETAIL,
  PUBLISH_EVENT,
  UNPUBLISH_EVENT,
  UPDATE_INCONTEXT_MATCHUP,
  topicConstants,
} from '@Constants/topicConstants';

export type EntityKind =
  'tournament' | 'participant' | 'event' | 'drawDefinition' | 'structure' | 'matchUp' | 'entries' | 'venue';
export type ChangeType = 'added' | 'modified' | 'removed';
export type CapturedNotice = { topic: string; payload: any };
export type EntityChange = { kind: EntityKind; id: string; change: ChangeType };
export type Violation = EntityChange & { reason: string };

// Fields that legitimately change without a dedicated notice (monotonic stamps,
// derived bookkeeping). Stripped before the structural compare so an `updatedAt`
// bump is not itself treated as an un-noticed change.
const INCIDENTAL_KEYS = new Set(['updatedAt', 'createdAt', 'timeStamp', 'processCodes', 'notes']);

/**
 * entity kind → the notice topics that legitimately cover a change of each type.
 * An EMPTY list encodes a KNOWN GAP in the notice vocabulary — e.g. there is no
 * MODIFY_EVENT / DELETE_EVENT topic today, so any event-attribute change is
 * uncoverable and surfaces as a violation (Workstream C2).
 */
export const entityTopicSpec: Record<EntityKind, Partial<Record<ChangeType, string[]>>> = {
  tournament: { modified: [MODIFY_TOURNAMENT_DETAIL] },
  participant: { added: [ADD_PARTICIPANTS], modified: [MODIFY_PARTICIPANTS], removed: [DELETE_PARTICIPANTS] },
  matchUp: {
    added: [ADD_MATCHUPS],
    modified: [MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP],
    removed: [DELETED_MATCHUP_IDS],
  },
  drawDefinition: {
    added: [ADD_DRAW_DEFINITION],
    modified: [MODIFY_DRAW_DEFINITION, MODIFY_SEED_ASSIGNMENTS, MODIFY_POSITION_ASSIGNMENTS],
    removed: [DELETED_DRAW_IDS],
  },
  structure: {
    added: [ADD_DRAW_DEFINITION, MODIFY_DRAW_DEFINITION],
    modified: [MODIFY_DRAW_DEFINITION, MODIFY_SEED_ASSIGNMENTS, MODIFY_POSITION_ASSIGNMENTS],
    removed: [DELETED_DRAW_IDS, MODIFY_DRAW_DEFINITION],
  },
  event: { added: [ADD_EVENT], modified: [MODIFY_EVENT, PUBLISH_EVENT, UNPUBLISH_EVENT], removed: [DELETE_EVENT] },
  entries: {
    added: [MODIFY_EVENT_ENTRIES, MODIFY_DRAW_ENTRIES],
    modified: [MODIFY_EVENT_ENTRIES, MODIFY_DRAW_ENTRIES],
    removed: [MODIFY_EVENT_ENTRIES, MODIFY_DRAW_ENTRIES],
  },
  venue: { added: [ADD_VENUE], modified: [MODIFY_VENUE], removed: [DELETE_VENUE] },
};

/**
 * Parent linkage built from the pre-mutation record, so a removed child can be
 * matched to an ancestor delete notice (a subtree delete is covered by the
 * delete of its root — the consumer cascades via foreign keys).
 */
export type Parentage = {
  drawOfStructure: Map<string, string>;
  drawOfMatchUp: Map<string, string>;
  eventOfDraw: Map<string, string>;
};

function collectMatchUpDrawIds(structure: any, drawId: string, out: Map<string, string>): void {
  for (const matchUp of structure?.matchUps ?? []) {
    out.set(matchUp.matchUpId, drawId);
    for (const tieMatchUp of matchUp.tieMatchUps ?? []) out.set(tieMatchUp.matchUpId, drawId);
  }
  for (const sub of structure?.structures ?? []) collectMatchUpDrawIds(sub, drawId, out);
}

export function buildParentage(record: any): Parentage {
  const drawOfStructure = new Map<string, string>();
  const drawOfMatchUp = new Map<string, string>();
  const eventOfDraw = new Map<string, string>();
  for (const event of record?.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      eventOfDraw.set(drawDefinition.drawId, event.eventId);
      for (const structure of drawDefinition.structures ?? []) {
        drawOfStructure.set(structure.structureId, drawDefinition.drawId);
        collectMatchUpDrawIds(structure, drawDefinition.drawId, drawOfMatchUp);
      }
    }
  }
  return { drawOfStructure, drawOfMatchUp, eventOfDraw };
}

/** Union two parentage maps (before + after) so added and removed rows both resolve. */
export function mergeParentage(a: Parentage, b: Parentage): Parentage {
  return {
    drawOfStructure: new Map([...a.drawOfStructure, ...b.drawOfStructure]),
    drawOfMatchUp: new Map([...a.drawOfMatchUp, ...b.drawOfMatchUp]),
    eventOfDraw: new Map([...a.eventOfDraw, ...b.eventOfDraw]),
  };
}

// Is a draw (and therefore everything beneath it) covered by a notice on the draw
// itself or on its ancestor event? Used for BOTH senses of ancestry: a removed child
// covered by its parent's delete (DELETED_DRAW_IDS / DELETE_EVENT), and — in the
// fidelity oracle — a projected row covered because a consumer must re-project the
// whole subtree when told "this draw changed".
function ancestorScopeCovers(drawId: string | undefined, noticed: Set<string>, parentage: Parentage): boolean {
  if (!drawId) return false;
  if (noticed.has(`drawDefinition:${drawId}`)) return true;
  const eventId = parentage.eventOfDraw.get(drawId);
  return !!eventId && noticed.has(`event:${eventId}`);
}

// entries are covered by a MODIFY_*_ENTRIES for their owning event/draw, or — when
// added/removed WITH the owning event/draw — by that ancestor's add/delete notice
// (ADD_DRAW_DEFINITION carries the new draw's entries; DELETE_EVENT/DELETED_DRAW_IDS
// take them away). A *modified* entry always needs its own MODIFY_*_ENTRIES.
function entriesCovered(change: EntityChange, noticed: Set<string>): boolean {
  for (const key of noticed) {
    if (!key.startsWith('entries:')) continue;
    const scope = key.slice('entries:'.length); // e.g. 'event:E1' or 'draw:D1'
    if (change.id.startsWith(`${scope}:`)) return true;
  }
  if (change.change === 'modified') return false;
  const [scopeKind, scopeId] = change.id.split(':'); // 'event'|'draw', <id>
  if (scopeKind === 'event') return noticed.has(`event:${scopeId}`);
  if (scopeKind === 'draw') return noticed.has(`drawDefinition:${scopeId}`);
  return false;
}

// a structure change is covered by a delete of its parent draw/event, or by any
// draw-level modify notice (structures move under a drawDefinition MODIFY).
function structureCovered(change: EntityChange, noticed: Set<string>, parentage: Parentage): boolean {
  if (ancestorScopeCovers(parentage.drawOfStructure.get(change.id), noticed, parentage)) return true;
  for (const key of noticed) if (key.startsWith('drawDefinition:')) return true;
  return false;
}

/**
 * Is a changed entity covered by the emitted notice stream? Exact `${kind}:${id}`
 * match first, then structural fallbacks: entries at event/draw scope, structures
 * under any draw notice, and — for removals — an ancestor delete notice.
 */
function isEntityCovered(change: EntityChange, noticed: Set<string>, parentage: Parentage): boolean {
  if (change.kind === 'entries') return entriesCovered(change, noticed);
  if (noticed.has(`${change.kind}:${change.id}`)) return true;
  if (change.kind === 'structure') return structureCovered(change, noticed, parentage);
  if (change.kind === 'matchUp' && change.change === 'removed') {
    return ancestorScopeCovers(parentage.drawOfMatchUp.get(change.id), noticed, parentage);
  }
  if (change.kind === 'drawDefinition' && change.change === 'removed') {
    const eventId = parentage.eventOfDraw.get(change.id);
    return !!eventId && noticed.has(`event:${eventId}`);
  }
  return false;
}

// An empty array / empty object is treated as absent: a mutation that merely
// initializes `timeItems: undefined → []` (draw generation does this per entrant)
// is not a meaningful change. A populated→empty transition is still detected —
// the populated side keeps the key, so the two records still differ.
function isEmptyCollection(value: any): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return !!value && typeof value === 'object' && Object.keys(value).length === 0;
}

function omit(obj: any, subtreeKeys: string[]): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = {};
  for (const key of Object.keys(obj)) {
    if (subtreeKeys.includes(key) || INCIDENTAL_KEYS.has(key)) continue;
    if (isEmptyCollection(obj[key])) continue;
    out[key] = obj[key];
  }
  return out;
}

function stableStringify(value: any): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v)
        .sort((a, b) => a.localeCompare(b))
        .reduce((acc: any, k) => {
          acc[k] = v[k];
          return acc;
        }, {});
    }
    return v;
  });
}

type EntityMaps = Record<EntityKind, Map<string, any>>;

function collectMatchUps(structure: any, out: Map<string, any>): void {
  for (const matchUp of structure?.matchUps ?? []) {
    // strip tieMatchUps — nested rubbers are tracked as their own matchUp entities
    out.set(matchUp.matchUpId, omit(matchUp, ['tieMatchUps']));
    for (const tieMatchUp of matchUp.tieMatchUps ?? [])
      out.set(tieMatchUp.matchUpId, omit(tieMatchUp, ['tieMatchUps']));
  }
  for (const sub of structure?.structures ?? []) collectMatchUps(sub, out);
}

/** Flatten a tournamentRecord into per-kind id→entity maps for structural diffing. */
export function collectEntities(record: any): EntityMaps {
  const maps: EntityMaps = {
    tournament: new Map(),
    participant: new Map(),
    event: new Map(),
    drawDefinition: new Map(),
    structure: new Map(),
    matchUp: new Map(),
    entries: new Map(),
    venue: new Map(),
  };
  // tournament-root scalar attributes only; sub-collections are tracked as their
  // own entity kinds, and root `extensions`/`timeItems` are out of scope (generic
  // extension setters are intentionally silent — see the notice-completeness plan).
  if (record?.tournamentId) {
    // `factory` is an engine version/timestamp stamp written on the first mutation
    // of a cycle — bookkeeping, not tournament data — so it is omitted too.
    maps.tournament.set(
      record.tournamentId,
      omit(record, ['events', 'participants', 'venues', 'extensions', 'timeItems', 'factory']),
    );
  }
  for (const participant of record?.participants ?? []) {
    maps.participant.set(participant.participantId, omit(participant, []));
  }
  for (const venue of record?.venues ?? []) {
    maps.venue.set(venue.venueId, omit(venue, []));
  }
  for (const event of record?.events ?? []) {
    // event attributes only — sub-entities are tracked separately
    maps.event.set(event.eventId, omit(event, ['drawDefinitions', 'entries']));
    for (const entry of event.entries ?? []) {
      maps.entries.set(`event:${event.eventId}:${entry.participantId}`, omit(entry, []));
    }
    for (const drawDefinition of event.drawDefinitions ?? []) {
      maps.drawDefinition.set(drawDefinition.drawId, omit(drawDefinition, ['structures', 'entries', 'links']));
      for (const entry of drawDefinition.entries ?? []) {
        maps.entries.set(`draw:${drawDefinition.drawId}:${entry.participantId}`, omit(entry, []));
      }
      for (const structure of drawDefinition.structures ?? []) {
        maps.structure.set(structure.structureId, omit(structure, ['matchUps', 'structures']));
        collectMatchUps(structure, maps.matchUp);
      }
    }
  }
  return maps;
}

/** Structural diff of two records → the list of changed entities (kind + id + change). */
export function changedEntities(before: any, after: any): EntityChange[] {
  const b = collectEntities(before);
  const a = collectEntities(after);
  const changes: EntityChange[] = [];
  for (const kind of Object.keys(b) as EntityKind[]) {
    const bm = b[kind];
    const am = a[kind];
    for (const [id, bv] of bm) {
      if (!am.has(id)) changes.push({ kind, id, change: 'removed' });
      else if (stableStringify(bv) !== stableStringify(am.get(id))) changes.push({ kind, id, change: 'modified' });
    }
    for (const id of am.keys()) if (!bm.has(id)) changes.push({ kind, id, change: 'added' });
  }
  return changes;
}

/** The set of `${kind}:${id}` an emitted notice stream legitimately covers. */
export function noticedEntityKeys(captured: CapturedNotice[]): Set<string> {
  const keys = new Set<string>();
  const add = (kind: EntityKind, id?: string) => id && keys.add(`${kind}:${id}`);
  for (const { topic, payload } of captured) {
    switch (topic) {
      case MODIFY_TOURNAMENT_DETAIL:
        add('tournament', payload?.tournamentId);
        break;
      case ADD_PARTICIPANTS:
      case MODIFY_PARTICIPANTS:
        for (const p of payload?.participants ?? []) add('participant', p?.participantId);
        break;
      case DELETE_PARTICIPANTS:
        for (const id of payload?.participantIds ?? payload?.participants?.map((p: any) => p?.participantId) ?? [])
          add('participant', id);
        break;
      case ADD_MATCHUPS:
        for (const m of payload?.matchUps ?? []) add('matchUp', m?.matchUpId);
        break;
      case MODIFY_MATCHUP:
        add('matchUp', payload?.matchUp?.matchUpId);
        break;
      case UPDATE_INCONTEXT_MATCHUP:
        add('matchUp', payload?.inContextMatchUp?.matchUpId);
        break;
      case DELETED_MATCHUP_IDS:
        for (const id of payload?.matchUpIds ?? []) add('matchUp', id);
        break;
      case ADD_DRAW_DEFINITION:
      case MODIFY_DRAW_DEFINITION:
        add('drawDefinition', payload?.drawDefinition?.drawId ?? payload?.drawId);
        break;
      case DELETED_DRAW_IDS:
        add('drawDefinition', payload?.drawId);
        break;
      case MODIFY_SEED_ASSIGNMENTS:
      case MODIFY_POSITION_ASSIGNMENTS:
        add('drawDefinition', payload?.drawId);
        add('structure', payload?.structureId);
        break;
      case ADD_EVENT:
      case MODIFY_EVENT:
        add('event', payload?.event?.eventId ?? payload?.eventId);
        break;
      case DELETE_EVENT:
        for (const id of payload?.eventIds ?? []) add('event', id);
        break;
      case MODIFY_EVENT_ENTRIES:
        // covers all entries of the event; matched loosely by eventId prefix below
        add('entries', `event:${payload?.eventId}`);
        break;
      case MODIFY_DRAW_ENTRIES:
        add('entries', `draw:${payload?.drawId}`);
        break;
      case ADD_VENUE:
      case MODIFY_VENUE:
        add('venue', payload?.venue?.venueId ?? payload?.venueId);
        break;
      case PUBLISH_EVENT:
        add('event', payload?.eventData?.eventInfo?.eventId ?? payload?.eventId);
        break;
      case UNPUBLISH_EVENT:
        add('event', payload?.eventId);
        break;
      case DELETE_VENUE:
        add('venue', payload?.venueId);
        break;
    }
  }
  return keys;
}

/**
 * COMPLETENESS check: every changed entity must be covered by a notice whose
 * topic is legitimate for its kind + change. Returns the violations (empty = OK).
 */
export function conformanceViolations(before: any, after: any, captured: CapturedNotice[]): Violation[] {
  const changes = changedEntities(before, after);
  const noticed = noticedEntityKeys(captured);
  const parentage = buildParentage(before);
  const violations: Violation[] = [];

  for (const change of changes) {
    const legitTopics = entityTopicSpec[change.kind]?.[change.change] ?? [];
    if (!legitTopics.length) {
      violations.push({ ...change, reason: `no notice topic exists to cover ${change.kind} ${change.change}` });
      continue;
    }
    if (!isEntityCovered(change, noticed, parentage)) {
      violations.push({ ...change, reason: `changed but not covered by a notice (${legitTopics.join('|')})` });
    }
  }
  return violations;
}

type Row = Record<string, any>;
export type CastTableDiff = { added: Row[]; removed: Row[]; modified: Array<{ before: Row; after: Row }> };

/**
 * cast() table → the record entity that OWNS each of its rows, and how to read that
 * entity's id off the row. This is the bridge that lets the fidelity oracle reuse the
 * completeness oracle's coverage logic (`isEntityCovered`) — including its structural
 * fallbacks for ancestor deletes and entries scoping — so the two oracles can never
 * disagree about what "covered" means.
 *
 * FAIL-CLOSED BY DESIGN: a cast() table with no entry here is reported as a violation
 * rather than skipped. Adding a table to the read model without deciding which notice
 * covers it is exactly the silent-projection-gap this harness exists to catch, and a
 * permissive default would hide it (see architectural-standards on fail-open defaults).
 */
const CAST_TABLE_OWNER: Record<string, { kind: EntityKind; idOf: (row: Row) => string | undefined }> = {
  tournaments: { kind: 'tournament', idOf: (r) => r.tournament_id },
  events: { kind: 'event', idOf: (r) => r.event_id },
  draws: { kind: 'drawDefinition', idOf: (r) => r.draw_id },
  structures: { kind: 'structure', idOf: (r) => r.structure_id },
  seeds: { kind: 'structure', idOf: (r) => r.structure_id },
  match_ups: { kind: 'matchUp', idOf: (r) => r.match_up_id },
  match_up_competitors: { kind: 'matchUp', idOf: (r) => r.match_up_id },
  // cast() projects EVENT-scoped entries only (no draw_id column), matching the
  // `event:<eventId>:<participantId>` key `collectEntities` builds.
  entries: { kind: 'entries', idOf: (r) => `event:${r.event_id}:${r.participant_id}` },
  venues: { kind: 'venue', idOf: (r) => r.venue_id },
  courts: { kind: 'venue', idOf: (r) => r.venue_id },
  tournament_venues: { kind: 'venue', idOf: (r) => r.venue_id },
  // tournament-scoped publication + planning state
  order_of_play: { kind: 'tournament', idOf: (r) => r.tournament_id },
  participant_publish: { kind: 'tournament', idOf: (r) => r.tournament_id },
  scheduling_profile: { kind: 'tournament', idOf: (r) => r.tournament_id },
};

/** The cast() tables the fidelity oracle knows how to attribute — for the drift guard. */
export function castTableOwnerNames(): string[] {
  return Object.keys(CAST_TABLE_OWNER);
}

/** Present on both sides of the diff = modified; one side only = added / removed. */
function resolveChange(wasAdded: boolean, wasRemoved: boolean): ChangeType {
  if (!wasAdded) return 'removed';
  return wasRemoved ? 'modified' : 'added';
}

export type FidelityViolation = EntityChange & { table: string; reason: string };

/**
 * Does the notice stream cover a projected row via an ANCESTOR of its owning entity?
 *
 * This is a property of the RECORD HIERARCHY, not of any particular consumer: a
 * tournamentRecord nests event → drawDefinition → structure → matchUp, so a notice
 * that says "draw D changed" necessarily obliges a consumer to re-project D's whole
 * subtree — it cannot know which rows underneath moved. (CFS does exactly this:
 * MODIFY_POSITION_ASSIGNMENTS → `flattenDraw`, PUBLISH_EVENT → `republishEvent` →
 * flatten every draw of the event. But the rule is derived from the record shape,
 * not copied from CFS — factory must not encode consumer semantics.)
 *
 * Deliberately does NOT treat a participant notice as covering a matchUp row.
 * Participants are a sibling collection referenced by id, not an ancestor, so
 * "participant P changed" does not tell a consumer which matchUp rows to re-project.
 * That asymmetry is load-bearing — it is what keeps the participant-rename →
 * `match_up_competitors` staleness visible instead of being explained away.
 */
function ancestorCovers(change: EntityChange, noticed: Set<string>, parentage: Parentage): boolean {
  if (change.kind === 'matchUp') return ancestorScopeCovers(parentage.drawOfMatchUp.get(change.id), noticed, parentage);
  if (change.kind === 'structure')
    return ancestorScopeCovers(parentage.drawOfStructure.get(change.id), noticed, parentage);
  if (change.kind === 'drawDefinition') {
    const eventId = parentage.eventOfDraw.get(change.id);
    return !!eventId && noticed.has(`event:${eventId}`);
  }
  return false;
}

/**
 * FIDELITY check (oracle (i)): every `cast()` row that a rebuild would change must be
 * covered by the notice stream. This is the north-star equation
 * `apply(noticeDeltas(S)) ≡ cast(R_after_S)` stated as a coverage assertion over the
 * PROJECTED rows rather than the raw record.
 *
 * It is NOT redundant with `conformanceViolations`. The completeness oracle diffs the
 * tournamentRecord and deliberately omits root `extensions`/`timeItems` and the
 * INCIDENTAL_KEYS; several cast row-builders READ exactly those (e.g.
 * `resolveSchedulingProfile` reads the SCHEDULING_PROFILE extension). A mutation that
 * writes only an extension is therefore invisible to completeness while still moving
 * projected rows — that class is only reachable from this side.
 */
export function fidelityViolations(before: any, after: any, captured: CapturedNotice[]): FidelityViolation[] {
  const diff = castDiff(before, after);
  const noticed = noticedEntityKeys(captured);
  // Merge before+after parentage: an ADDED row (draw generation, position assignment
  // into a new matchUp) has no ancestor in `before`, and a REMOVED one has none in
  // `after`. Reading only one side would silently mis-resolve half the changes.
  const parentage = mergeParentage(buildParentage(before), buildParentage(after));
  const violations: FidelityViolation[] = [];

  for (const [table, tableDiff] of Object.entries(diff)) {
    const owner = CAST_TABLE_OWNER[table];
    if (!owner) {
      violations.push({
        kind: 'tournament',
        id: table,
        change: 'modified',
        table,
        reason: `cast() table '${table}' has no CAST_TABLE_OWNER mapping — decide which notice covers it`,
      });
      continue;
    }
    const removedIds = new Set(tableDiff.removed.map(owner.idOf).filter(Boolean) as string[]);
    const addedIds = new Set(tableDiff.added.map(owner.idOf).filter(Boolean) as string[]);
    for (const id of new Set([...removedIds, ...addedIds])) {
      const change: ChangeType = resolveChange(addedIds.has(id), removedIds.has(id));
      const entityChange: EntityChange = { kind: owner.kind, id, change };
      if (!isEntityCovered(entityChange, noticed, parentage) && !ancestorCovers(entityChange, noticed, parentage)) {
        violations.push({
          ...entityChange,
          table,
          reason: `cast().${table} row ${change} but no notice covers ${owner.kind} ${id}`,
        });
      }
    }
  }
  return violations;
}

function castRows(record: any): Record<string, Row[]> {
  return (cast({ tournamentRecord: record })?.rows as any) ?? {};
}

/**
 * FIDELITY check helper: per-table row diff of `cast()` before vs after. A table's
 * primary-ish key is inferred from the first `*_id` column. Used to assert that
 * the notice-driven projection delta equals this rebuild delta.
 */
export function castDiff(before: any, after: any): Record<string, CastTableDiff> {
  const b = castRows(before);
  const a = castRows(after);
  const out: Record<string, CastTableDiff> = {};
  const tables = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const table of tables) {
    const keyOf = (row: Row) => stableStringify(row);
    const bRows = new Map((b[table] ?? []).map((r) => [keyOf(r), r]));
    const aRows = new Map((a[table] ?? []).map((r) => [keyOf(r), r]));
    const diff: CastTableDiff = { added: [], removed: [], modified: [] };
    for (const [k, r] of aRows) if (!bRows.has(k)) diff.added.push(r);
    for (const [k, r] of bRows) if (!aRows.has(k)) diff.removed.push(r);
    if (diff.added.length || diff.removed.length) out[table] = diff;
  }
  return out;
}

/**
 * Run `fn` with subscriptions to EVERY topic installed, capturing the notices
 * the engine delivers during it. Restores an empty subscription set afterward.
 */
export function captureNotices(fn: () => void): CapturedNotice[] {
  const captured: CapturedNotice[] = [];
  const subscriptions: Record<string, (payloads: any[]) => void> = {};
  for (const topic of Object.values(topicConstants) as string[]) {
    subscriptions[topic] = (payloads: any[]) => {
      for (const payload of payloads ?? []) captured.push({ topic, payload });
    };
  }
  setSubscriptions({ subscriptions });
  deleteNotices();
  try {
    fn();
  } finally {
    setSubscriptions({ subscriptions: {} });
    deleteNotices();
  }
  return captured;
}
