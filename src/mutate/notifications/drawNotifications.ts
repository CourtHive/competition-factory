import { addNotice, deleteNotice, DEFERRED_PAYLOAD, getCapturedStamps, markModified } from '@Global/state/globalState';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getDrawPositionSides } from '@Query/matchUps/getDrawPositionSides';
import { drawOrigin, eventOrigin } from '@Query/readModel/readModelRows';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { requireParams } from '@Helpers/parameters/requireParams';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { nowMs } from '@Tools/clock';

// constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';
import { DRAW_DEFINITION, STRUCTURE } from '@Constants/attributeConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ADD_DRAW_DEFINITION,
  ADD_MATCHUPS,
  DELETED_DRAW_IDS,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_SEED_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * The next `updatedAt` for an entity: now, or 1 ms past its previous stamp when that is already now or later, so a
 * stamp always moves on (an ordering value, not an event instant). Under a fixed or backward clock an equality-only
 * bump gave T, T+1, T.
 *
 * ONCE PER CALL (F2 (i), CA 2026-10-19): inside an engine call, an entity already stamped in that call keeps its stamp,
 * so a stamp means "changed in this call" however many notices the call raised for it. v2 writes the same value
 * (`outcome/ops.ts` `nextStamp`). Outside an engine call, or with a state provider that keeps no ledger, every
 * stamp moves on, as before.
 */
function stampUpdatedAt(entity?: { updatedAt?: string | Date } | null) {
  const stamped = getCapturedStamps();
  if (!entity || stamped?.has(entity)) return undefined;
  const previous = entity.updatedAt;
  const prevMs = typeof previous === 'string' ? new Date(previous).getTime() : previous?.getTime();
  const timeStamp = nowMs();
  const next = prevMs !== undefined && !Number.isNaN(prevMs) && timeStamp <= prevMs ? prevMs + 1 : timeStamp;
  entity.updatedAt = new Date(next).toISOString();
  stamped?.add(entity);
  return undefined;
}

function drawUpdatedAt(drawDefinition: DrawDefinition, structureIds?: string[]) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const relevantStructureIds = structureIds?.filter(Boolean);

  stampUpdatedAt(drawDefinition);
  drawDefinition.structures?.filter(Boolean).forEach((structure) => {
    if (!relevantStructureIds?.length || relevantStructureIds?.includes(structure.structureId)) {
      stampUpdatedAt(structure);
    }
  });

  return { ...SUCCESS };
}

/** Stamp a matchUp to mark that it has just been modified: `stampUpdatedAt`, so once per call. */
function stampMatchUpUpdatedAt(matchUp?: MatchUp | null) {
  stampUpdatedAt(matchUp);
}

/**
 * What the notices of a write would stamp, for a write made with `suppressNotifications`: its matchUps, then the draw and
 * its top-level structures, and the record marked modified (so it takes the factory stamp), with nothing announced.
 * What a write stores does not depend on whether it is announced.
 */
export function stampUnannounced({
  drawDefinition,
  tournamentId,
  matchUps,
}: {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  matchUps?: MatchUp[];
}) {
  for (const matchUp of matchUps ?? []) stampMatchUpUpdatedAt(matchUp);
  if (drawDefinition) drawUpdatedAt(drawDefinition);
  markModified(tournamentId);
}

type AddMatchUpsNoticeArgs = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  matchUps: MatchUp[];
  eventId?: string;
};
export function addMatchUpsNotice({ drawDefinition, tournamentId, matchUps, eventId }: AddMatchUpsNoticeArgs) {
  if (drawDefinition) drawUpdatedAt(drawDefinition);
  // Stamp each matchUp's own updatedAt so downstream consumers (TMX
  // matchUps table, arena relay, audit log) can distinguish freshly-
  // touched matchUps from stale ones without walking drawDefinition.
  if (Array.isArray(matchUps)) {
    for (const matchUp of matchUps) stampMatchUpUpdatedAt(matchUp);
  }
  addNotice({
    payload: { matchUps, tournamentId, eventId },
    topic: ADD_MATCHUPS,
  });

  return { ...SUCCESS };
}

type DeleteMatchUpsNoticeArga = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  matchUpIds: string[];
  eventId?: string;
  action?: any;
};
export function deleteMatchUpsNotice({
  drawDefinition,
  tournamentId,
  matchUpIds,
  eventId,
  action,
}: DeleteMatchUpsNoticeArga) {
  if (drawDefinition) drawUpdatedAt(drawDefinition);
  addNotice({
    topic: DELETED_MATCHUP_IDS,
    payload: {
      tournamentId,
      matchUpIds,
      eventId,
      action,
    },
  });
  for (const matchUpId of matchUpIds) {
    deleteNotice({ key: matchUpId });
  }

  return { ...SUCCESS };
}

type ModifyMatchUpNoticeArgs = {
  /**
   * Optional in the type, but PASS IT. The notice's `structureId` is resolved from it, and a
   * subscriber that cannot place a matchUp cannot route the notice — CFS uses `structureId` for
   * structure-grain cache eviction, and `winnerMatchUpId` / `loserMatchUpId` are projected
   * read-model columns.
   *
   * It stayed optional deliberately. Passing it was believed to emit a redundant draw notice per
   * matchUp; it does not — `modifyDrawNotice` calls `addNotice` with `key: drawDefinition.drawId`,
   * so they collapse onto one (measured: 24 and 48 matchUp notices against 1 draw notice either
   * way). But requiring it in the TYPE cascades into five more files, two of which legitimately
   * hold a `drawId` and let the callee resolve the draw, and the guards that cascade forces are the
   * shape that drops a notice silently. The guarantee lives in `noticeStructureId.test.ts` instead,
   * which sweeps a spread of operations and asserts no MODIFY_MATCHUP names a structure it cannot —
   * a behavioural check no `!` can satisfy.
   */
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  structureId?: string;
  matchUp: MatchUp;
  eventId?: string;
  context?: any;
  /**
   * The event this matchUp belongs to. Supplied so the notice can carry the SANCTIONING ORIGIN —
   * one tournamentRecord can hold events sanctioned by several organisations, and a subscriber
   * driving fan-out must be able to attribute a change without resolving the event itself.
   *
   * Callers rarely need to add it: `paramsMiddleware` already resolves `drawId` (or
   * `matchUp.drawId`) into `params.event`, so most engine-entry methods receive it and only need to
   * destructure it.
   */
  event?: any;
};

/**
 * Resolve the structure a matchUp lives in, for notice ATTRIBUTION only.
 *
 * Stored matchUps carry no `structureId` — only inContext ones do — so a notice emitted from the
 * mutation path has nothing to read. Callers that already hold a `structure` should pass
 * `structureId` explicitly; this is the fallback that keeps the envelope populated for the 57 of 61
 * `modifyMatchUpNotice` call sites that do not, every score path among them.
 *
 * Returns the id of the structure DIRECTLY holding the matchUp — for round robins that is the group
 * (child) structure, matching what `allTournamentMatchUps` reports inContext. Conformance with that
 * convention is asserted in noticeStructureId.test.ts; a subscriber must not have to know which of
 * two vocabularies a given topic used.
 */
function resolveStructureId(drawDefinition?: DrawDefinition, matchUpId?: string): string | undefined {
  if (!drawDefinition?.structures?.length || !matchUpId) return undefined;

  const search = (structures: any[]): string | undefined => {
    for (const structure of structures) {
      // Depth first: the group structure owns the matchUp, not its round-robin parent.
      if (structure?.structures?.length) {
        const found = search(structure.structures);
        if (found) return found;
      }
      if (structure?.matchUps?.some((m: any) => m?.matchUpId === matchUpId)) return structure.structureId;
    }
    return undefined;
  };

  return search(drawDefinition.structures);
}

/**
 * The top-level structure whose subtree holds the matchUp: a round robin's container for a group's matchUp, and the
 * structure of the dual for one of its lines. The level `drawUpdatedAt` stamps at.
 */
function topLevelStructureId(drawDefinition: DrawDefinition, matchUpId: string): string | undefined {
  const holds = (structure: Structure): boolean =>
    !!matchUpsOf(structure)?.some(
      (matchUp) => matchUp.matchUpId === matchUpId || matchUp.tieMatchUps?.some((line) => line.matchUpId === matchUpId),
    ) || !!structuresOf(structure)?.some(holds);
  return drawDefinition.structures?.find(holds)?.structureId;
}

export function modifyMatchUpNotice({
  drawDefinition,
  tournamentId,
  structureId,
  context,
  eventId,
  matchUp,
  event,
}: ModifyMatchUpNoticeArgs) {
  if (!matchUp) {
    pushGlobalLog({ method: 'drawNotifications', error: MISSING_MATCHUP });
    return { error: MISSING_MATCHUP };
  }
  // Resolve ONCE and use everywhere. Previously the fallback was applied to this notice's own payload
  // but not to the drawNotice below, so a caller supplying `event` (and not `eventId`) produced a
  // MODIFY_MATCHUP that could be attributed and a MODIFY_DRAW_DEFINITION that could not — from the
  // same call. One unattributable notice is enough to cost a consumer the whole batch's granularity.
  const resolvedEventId = eventId ?? event?.eventId;

  if (drawDefinition) {
    // the draw and the ONE top-level structure that holds the matchUp are stamped (F2 (i), CA 2026-10-19): a stamp
    // means "changed in this call", and the other structures did not change. Until 2026-10-24 every top-level
    // structure was stamped unless the caller named one; nothing in the factory or its consumers reads a structure's
    // stamp. A matchUp no top-level structure is found to hold still stamps every structure, as before.
    const stampedStructureId = topLevelStructureId(drawDefinition, matchUp.matchUpId) ?? structureId;
    const structureIds = stampedStructureId ? [stampedStructureId] : undefined;
    modifyDrawNotice({
      drawDefinition,
      structureIds,
      tournamentId,
      eventId: resolvedEventId,
    });
  }
  // Stamp the matchUp itself so consumers can see at-a-glance that it
  // was just touched (complements the drawDefinition + structure
  // timestamps written above via `modifyDrawNotice`).
  stampMatchUpUpdatedAt(matchUp);
  // Most-specific grain wins. A matchUp lives in a DRAW, and an origin system supplies only the grains
  // it actually models — a UTR flight carries tournament + draw ids with NO event grain at all
  // (see drawOrigin in readModelRows). Resolving only the event origin would leave those notices with
  // no attribution whatsoever, which is the case fan-out most needs. One coherent origin per notice
  // rather than two organisationIds that could disagree.
  const origin = drawOrigin(drawDefinition) ?? eventOrigin(event);
  const resolvedStructureId = structureId ?? resolveStructureId(drawDefinition, matchUp?.matchUpId);
  addNotice({
    topic: MODIFY_MATCHUP,
    // eventId/drawId/structureId ride the ENVELOPE, not just the entity. A subscriber that only needs
    // to know WHICH event changed — cache eviction, fan-out routing — should not have to resolve the
    // matchUp to find out. `drawDefinition` is optional here, so drawId is best-effort.
    payload: {
      matchUp,
      tournamentId,
      eventId: resolvedEventId,
      drawId: drawDefinition?.drawId ?? (matchUp as any)?.drawId,
      // Best-effort, same as drawId above: an explicit caller value wins, otherwise resolve it from
      // the drawDefinition so the envelope is populated regardless of call site.
      structureId: resolvedStructureId,
      // WHICH SIDE each drawPosition is on, and ONLY while `drawPositions` cannot say. The array is
      // compacted, so a matchUp awaiting its second participant ships as `[4]` and a subscriber
      // reading `drawPositions[sideNumber - 1]` indexes past the end — or, reading the other way,
      // seats the arrival on side 1 when it belongs on side 2. Absent once both positions are
      // present, because side 1 is then the numerically lower one and the subscriber can say so
      // itself. Absent also when it cannot be resolved — never a guess.
      drawPositionSides: getDrawPositionSides({ structureId: resolvedStructureId, drawDefinition, matchUp }),
      // The sanctioning source, flattened — same vocabulary as the read-model's
      // origin_organisation_id / origin_tournament_id / origin_event_id. Absent when the event
      // declares no origin, which is the ordinary single-sanction case.
      originOrganisationId: origin?.organisationId,
      originTournamentId: origin?.tournamentId,
      originEventId: origin?.eventId,
      originDrawId: (origin as any)?.drawId,
      context,
    },
    key: matchUp.matchUpId,
  });

  return { ...SUCCESS };
}

/**
 * `UPDATE_INCONTEXT_MATCHUP` with the in-context matchUp built only when the notices are read, after the call has
 * succeeded (`globalState.getPayloads`): a refused call, which deletes its notices, builds none. Keyed by the matchUp,
 * so a call that writes it more than once builds it once, as the call left it.
 */
export function deferInContextMatchUp({
  inContextMatchUp,
  tournamentId,
  matchUpId,
}: {
  inContextMatchUp: () => HydratedMatchUp | undefined;
  tournamentId?: string;
  matchUpId: string;
}) {
  addNotice({
    payload: {
      [DEFERRED_PAYLOAD]: () => {
        const built = inContextMatchUp();
        return built ? { inContextMatchUp: built, tournamentId } : undefined;
      },
      tournamentId,
      matchUpId,
    },
    topic: UPDATE_INCONTEXT_MATCHUP,
    key: matchUpId,
  });
  return { ...SUCCESS };
}

export function updateInContextMatchUp({ tournamentId, inContextMatchUp }) {
  if (!inContextMatchUp) {
    return { error: MISSING_MATCHUP };
  }
  addNotice({
    payload: { inContextMatchUp, tournamentId },
    topic: UPDATE_INCONTEXT_MATCHUP,
    key: inContextMatchUp.matchUpId,
  });

  return { ...SUCCESS };
}

type AddDrawNoticeArgs = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  eventId?: string;
};
export function addDrawNotice({ tournamentId, eventId, drawDefinition }: AddDrawNoticeArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  if (!drawDefinition) {
    pushGlobalLog({ method: 'drawNotifications', error: MISSING_DRAW_DEFINITION });
    return { error: MISSING_DRAW_DEFINITION };
  }
  drawUpdatedAt(drawDefinition);
  addNotice({
    payload: { drawDefinition, tournamentId, eventId },
    topic: ADD_DRAW_DEFINITION,
    key: drawDefinition.drawId,
  });

  return { ...SUCCESS };
}

type DeleteDrawNoticeArgs = {
  tournamentId?: string;
  eventId?: string;
  drawId: string;
};
export function deleteDrawNotice({ tournamentId, eventId, drawId }: DeleteDrawNoticeArgs) {
  // NB: the DELETED_DRAW_IDS notice is added WITHOUT a key (mirroring
  // deleteMatchUpsNotice's DELETED_MATCHUP_IDS). The `deleteNotice({ key: drawId })`
  // purge below removes prior keyed notices for this draw (ADD/MODIFY_DRAW_DEFINITION)
  // that are now moot — but deleteNotice filters on key alone, so a keyed
  // DELETED_DRAW_IDS here would purge itself and never be delivered.
  addNotice({
    payload: { drawId, tournamentId, eventId },
    topic: DELETED_DRAW_IDS,
  });
  deleteNotice({ key: drawId });

  return { ...SUCCESS };
}

type ModifyDrawNoticeArgs = {
  drawDefinition: DrawDefinition;
  structureIds?: string[];
  tournamentId?: string;
  eventId?: string;
};
export function modifyDrawNotice({ drawDefinition, tournamentId, structureIds, eventId }: ModifyDrawNoticeArgs) {
  if (!drawDefinition) {
    return { error: MISSING_DRAW_DEFINITION };
  }
  drawUpdatedAt(drawDefinition, structureIds);
  addNotice({
    payload: { tournamentId, eventId, drawDefinition },
    topic: MODIFY_DRAW_DEFINITION,
    key: drawDefinition.drawId,
  });

  return { ...SUCCESS };
}

export function modifySeedAssignmentsNotice({ drawDefinition, tournamentId, structure, eventId }) {
  const paramsCheck = requireParams({ drawDefinition, structure }, [DRAW_DEFINITION, STRUCTURE]);
  if (paramsCheck.error) return paramsCheck;

  const seedAssignments = structure.seedAssignments;
  const structureId = structure.structureId;
  const drawId = drawDefinition.drawId;

  addNotice({
    payload: { tournamentId, eventId, drawId, structureId, seedAssignments },
    topic: MODIFY_SEED_ASSIGNMENTS,
    key: drawDefinition.drawId,
  });
  modifyDrawNotice({
    structureIds: [structureId],
    drawDefinition,
    tournamentId,
    eventId,
  });

  return { ...SUCCESS };
}

export function modifyPositionAssignmentsNotice({ drawDefinition, tournamentId, structure, event }) {
  const paramsCheck = requireParams({ drawDefinition, structure }, [DRAW_DEFINITION, STRUCTURE]);
  if (paramsCheck.error) return paramsCheck;

  // the getter returns `{ positionAssignments }`: the notice carries the array, which every consumer iterates
  const { positionAssignments } = getPositionAssignments({ structure });
  const structureId = structure.structureId;
  const drawId = drawDefinition.drawId;
  const eventId = event?.eventId;

  addNotice({
    topic: MODIFY_POSITION_ASSIGNMENTS,
    payload: {
      positionAssignments,
      tournamentId,
      structureId,
      eventId,
      drawId,
    },
    key: structureId,
  });

  modifyDrawNotice({
    structureIds: [structureId],
    drawDefinition,
    tournamentId,
    eventId,
  });

  return { ...SUCCESS };
}
