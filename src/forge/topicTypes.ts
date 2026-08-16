/**
 * TopicPayloadMap — discriminated union of subscription topic → payload.
 *
 * Type definitions for the typed event bus (`engine.on/once/off/waitFor`,
 * see `bus.ts`, developer-JOY #5). Each key MUST match a constant in
 * `@Constants/topicConstants`; the value is the shape that the bus passes
 * to subscriber handlers (one notice's `payload` field at a time, not the
 * array of notices the legacy `setSubscriptions` callback receives).
 *
 * Coverage is intentionally partial — the ~10 highest-traffic topics that
 * power TMX, the arena relay, server audit, and ingest. Other topics fall
 * through the index signature and arrive as `unknown`; consumers cast at
 * the call site. Adding a new precisely-typed topic is purely additive:
 * append the key, no other change required.
 *
 * Payload shapes are derived from inspection of `addNotice({ topic, payload })`
 * callsites in `src/mutate/**`. Fields that some callsites omit are marked
 * optional (e.g. `tournamentId` for participant topics).
 */

import type { MatchUp, Event, DrawDefinition } from '@Types/tournamentTypes';

// ============================================================================
// Identity envelope
// ============================================================================

/**
 * The identity a subscriber needs to route a change WITHOUT resolving the entity it describes.
 *
 * Topics touching events / draws / structures / matchUps carry as much of this as applies, on the
 * payload itself rather than only nested inside `event`, `matchUp` or `eventData`. That distinction is
 * what lets a subscriber drive cache eviction and data fan-out from the notice alone — see
 * `Mentat/planning/FACTORY_NOTICE_IDENTITY_AUDIT.md`.
 *
 * Fields are optional because scope genuinely differs: a venue change has no `eventId`, and forcing one
 * would invent precision that does not exist.
 */
export interface NoticeIdentity {
  tournamentId?: string;
  eventId?: string;
  drawId?: string;
  structureId?: string;
}

// ============================================================================
// Per-topic payload shapes
// ============================================================================

export interface AddEventPayload {
  tournamentId: string;
  event: Event;
}

export interface AddDrawDefinitionPayload {
  tournamentId: string;
  eventId: string;
  drawDefinition: DrawDefinition;
}

export interface ModifyDrawDefinitionPayload {
  tournamentId: string;
  eventId: string;
  drawDefinition: DrawDefinition;
}

export interface DeletedDrawIdsPayload {
  tournamentId: string;
  eventId?: string;
  drawId: string;
}

export interface AddMatchUpsPayload {
  tournamentId: string;
  eventId: string;
  matchUps: MatchUp[];
}

export interface ModifyMatchUpPayload extends NoticeIdentity {
  tournamentId: string;
  matchUp: MatchUp;
  /** `drawDefinition` is optional at the emit site, so this is best-effort. */
  drawId?: string;
  context?: { [key: string]: any };
}

export interface DeletedMatchUpIdsPayload {
  tournamentId: string;
  eventId?: string;
  matchUpIds: string[];
  action?: string;
}

export interface AddParticipantsPayload {
  /** Some emit sites (e.g. mergeParticipants) omit tournamentId. */
  tournamentId?: string;
  participants: any[];
}

export interface ModifyParticipantsPayload {
  tournamentId?: string;
  participants: any[];
}

export interface DeleteParticipantsPayload {
  tournamentId?: string;
  participantIds: string[];
}

export interface PublishEventPayload extends NoticeIdentity {
  tournamentId: string;
  /** On the envelope, not only inside `eventData.eventInfo` — a subscriber needing just the id
   *  should not have to reach through the payload for it. */
  eventId?: string;
  eventData: any;
}

/**
 * ⚠️ CORRECTED 2026-08-16 — this previously declared `tournamentRecord: Tournament`, which **no
 * callsite has ever emitted**. A consumer reading `payload.tournamentRecord.tournamentId` got a
 * TypeError. Found by the conformance guard in `src/tests/forge/topicPayloadConformance.test.ts` on its
 * first run — the exact failure the guard exists for.
 *
 * Real shape, across all 11 emit sites: `tournamentId` is the only universal field;
 * `parentOrganisation` rides 10 of 11; the remaining keys are detail-specific (`notes`,
 * `localTimeZone`, `tournamentTier`, `registrationProfile`, `categories`, `onlineResources`,
 * `timeItemValues`, or a spread of `detailUpdates`).
 */
export interface ModifyTournamentDetailPayload {
  tournamentId: string;
  parentOrganisation?: any;
  /** Detail-specific — which key arrives depends on which mutation fired. */
  [detail: string]: unknown;
}

export interface ModifyPositionAssignmentsPayload extends NoticeIdentity {
  tournamentId: string;
  eventId: string;
  drawId: string;
  structureId: string;
  positionAssignments: any[];
}

export interface ModifySeedAssignmentsPayload extends NoticeIdentity {
  tournamentId: string;
  eventId: string;
  drawId: string;
  structureId: string;
  seedAssignments: any[];
}

export interface ModifyDrawEntriesPayload extends NoticeIdentity {
  tournamentId: string;
  eventId: string;
  drawId: string;
  drawEntries: any[];
}

export interface ModifyEventEntriesPayload extends NoticeIdentity {
  tournamentId: string;
  eventId: string;
  entries: any[];
}

export interface UnPublishEventPayload extends NoticeIdentity {
  tournamentId: string;
  eventId: string;
}

export interface ModifyEventPayload {
  tournamentId: string;
  event: Event;
}

// ============================================================================
// TopicPayloadMap
// ============================================================================

/**
 * Subscribers passed to `engine.on(topic, handler)` receive one payload per
 * invocation (the bus iterates the underlying notice array for you). The
 * mapped types here select payload shape from topic name.
 *
 * Topics not in this map are still subscribable — they fall through the
 * index signature and arrive as `unknown`. Use a type cast or narrow at
 * the call site:
 *
 *   engine.on('SOME_FUTURE_TOPIC', (p) => {
 *     const payload = p as { foo: string };
 *     // ...
 *   });
 */
export interface TopicPayloadMap {
  addEvent: AddEventPayload;
  addDrawDefinition: AddDrawDefinitionPayload;
  modifyDrawDefinition: ModifyDrawDefinitionPayload;
  deletedDrawIds: DeletedDrawIdsPayload;
  addMatchUps: AddMatchUpsPayload;
  modifyMatchUp: ModifyMatchUpPayload;
  deletedMatchUpIds: DeletedMatchUpIdsPayload;
  addParticipants: AddParticipantsPayload;
  modifyParticipants: ModifyParticipantsPayload;
  deleteParticipants: DeleteParticipantsPayload;
  publishEvent: PublishEventPayload;
  unPublishEvent: UnPublishEventPayload;
  modifyEvent: ModifyEventPayload;
  modifyPositionAssignments: ModifyPositionAssignmentsPayload;
  modifySeedAssignments: ModifySeedAssignmentsPayload;
  modifyDrawEntries: ModifyDrawEntriesPayload;
  modifyEventEntries: ModifyEventEntriesPayload;
  modifyTournamentDetail: ModifyTournamentDetailPayload;

  // Catch-all for un-typed topics — keeps the bus typeable without forcing
  // every consumer to add their own map. Listed last so IDE completion still
  // prefers the precisely-typed keys above.
  [topic: string]: unknown;
}

export type Topic = keyof TopicPayloadMap & string;
