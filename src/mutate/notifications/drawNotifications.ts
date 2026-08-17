import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { addNotice, deleteNotice } from '@Global/state/globalState';
import { requireParams } from '@Helpers/parameters/requireParams';
import { drawOrigin, eventOrigin } from '@Query/readModel/readModelRows';

// Constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION, STRUCTURE } from '@Constants/attributeConstants';
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
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

function drawUpdatedAt(drawDefinition: DrawDefinition, structureIds?: string[]) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  let timeStamp = Date.now();
  if (drawDefinition.updatedAt && timeStamp === new Date(drawDefinition.updatedAt).getTime()) timeStamp += 1;
  const updatedAt = new Date(timeStamp).toISOString();

  const relevantStructureIds = structureIds?.filter(Boolean);

  drawDefinition.updatedAt = updatedAt;
  drawDefinition.structures?.filter(Boolean).forEach((structure) => {
    if (!relevantStructureIds?.length || relevantStructureIds?.includes(structure.structureId)) {
      structure.updatedAt = updatedAt;
    }
  });

  return { ...SUCCESS };
}

/**
 * Stamp an ISO UTC timestamp on a matchUp to mark that it has just been
 * modified. Mirrors the monotonic bump used by `drawUpdatedAt` — if the
 * wall-clock reads the same millisecond as the previously-recorded
 * timestamp, we bump by 1ms so every mutation produces a strictly-
 * greater `updatedAt`. Safe no-op on a falsy matchUp.
 */
function stampMatchUpUpdatedAt(matchUp?: MatchUp | null) {
  if (!matchUp) return;
  let timeStamp = Date.now();
  const previous = matchUp.updatedAt;
  if (previous) {
    const prevMs = typeof previous === 'string' ? new Date(previous).getTime() : previous.getTime();
    if (!Number.isNaN(prevMs) && timeStamp <= prevMs) timeStamp = prevMs + 1;
  }
  matchUp.updatedAt = new Date(timeStamp).toISOString();
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
    console.log(MISSING_MATCHUP);
    return { error: MISSING_MATCHUP };
  }
  // Resolve ONCE and use everywhere. Previously the fallback was applied to this notice's own payload
  // but not to the drawNotice below, so a caller supplying `event` (and not `eventId`) produced a
  // MODIFY_MATCHUP that could be attributed and a MODIFY_DRAW_DEFINITION that could not — from the
  // same call. One unattributable notice is enough to cost a consumer the whole batch's granularity.
  const resolvedEventId = eventId ?? event?.eventId;

  if (drawDefinition) {
    // DELIBERATELY the caller-supplied structureId only, NOT the resolved one below. This argument
    // decides which structures get their `updatedAt` stamped by `drawUpdatedAt`; widening it to the
    // resolved id would narrow stamping from "every structure" to "one" at 57 call sites — a
    // behaviour change to timestamps consumers may sync on. Notice attribution and updatedAt
    // stamping are separate concerns and are kept separate here.
    const structureIds = structureId ? [structureId] : undefined;
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
      structureId: structureId ?? resolveStructureId(drawDefinition, matchUp?.matchUpId),
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
    console.log(MISSING_DRAW_DEFINITION);
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

  const positionAssignments = getPositionAssignments({ structure });
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
