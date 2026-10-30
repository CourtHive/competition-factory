import { entityIdMismatch, EntityParams } from '@Helpers/parameters/entityIdMismatch';
import { getTournamentId } from '@Global/state/globalState';
import { findEvent } from '@Acquire/findEvent';
import { isObject } from '@Tools/objects';

// constants and types
import { TournamentRecords } from '@Types/factoryTypes';
import {
  DRAW_DEFINITION_NOT_FOUND,
  ErrorType,
  EVENT_NOT_FOUND,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

// the methods whose entity param is the entity they create, not one in state to resolve
const PAYLOADS: { [methodName: string]: string } = {
  addDrawDefinition: 'drawDefinition',
  addEvent: 'event',
};

/**
 * An engine call works only on the records the engine holds (CA 2026-10-30: a write never silently goes nowhere). Before
 * every method, the tournament record, the draw and the event it names are resolved to the ones in state, whether
 * they are named by id or passed as objects (an object is resolved by its own id); a caller's own copy is never the
 * one written to or read. One that is not held refuses the call, and an object whose own id is not the id it is given
 * beside it refuses the call (entityIdMismatch). A method's creation payload (`addEvent`'s event, `addDrawDefinition`'s
 * drawDefinition) is not resolved. building-a-tournament.md §1.3.
 */
export function paramsMiddleware(
  tournamentRecords: TournamentRecords,
  params: { [key: string]: any },
  methodName?: string,
) {
  if (params._middleware === false) return params;

  const payload = methodName ? PAYLOADS[methodName] : undefined;
  const refusal =
    entityIdMismatch(payloadAside(params, payload)) ??
    resolveRecord(tournamentRecords, params) ??
    resolveDrawAndEvent(tournamentRecords, params, payload);
  if (refusal) return refusal;

  const tournamentId = params.tournamentId ?? getTournamentId();
  if (!tournamentId && params) return params;

  const tournamentRecord = tournamentRecords[tournamentId];
  if (tournamentId && !tournamentRecord) {
    return { error: MISSING_TOURNAMENT_RECORD };
  }

  if (!tournamentRecord) return params;
  params.tournamentRecord = tournamentRecord;

  return params;
}

type Params = EntityParams;
type Refusal = { error: ErrorType } | undefined;

// a tournament record passed is resolved by its tournamentId; a tournamentId must name a loaded record
function resolveRecord(tournamentRecords: TournamentRecords, params: Params): Refusal {
  if (isObject(params.tournamentRecord)) {
    params.tournamentId ??= params.tournamentRecord?.tournamentId;
    delete params.tournamentRecord;
    if (!params.tournamentId) return { error: MISSING_TOURNAMENT_RECORD };
  }
  if (params.tournamentId && !tournamentRecords[params.tournamentId]) return { error: MISSING_TOURNAMENT_RECORD };
  return undefined;
}

// a draw passed is resolved by its drawId and must be held; a drawId found gives its draw, event and record
function resolveDrawAndEvent(tournamentRecords: TournamentRecords, params: Params, payload?: string): Refusal {
  const drawPassed = payload !== 'drawDefinition' && isObject(params.drawDefinition);
  if (drawPassed) {
    params.drawId ??= params.drawDefinition?.drawId;
    delete params.drawDefinition;
  }

  const drawId = params.drawId || params.matchUp?.drawId;
  const found = drawId ? findEvent({ tournamentRecords, drawId }) : undefined;
  if (drawPassed && !found?.drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  // a drawId found nowhere, given alone, resolves nothing: the method decides
  if (found?.drawDefinition) {
    params.drawDefinition = found.drawDefinition;
    if (found.tournamentId) params.tournamentId = found.tournamentId;
    if (found.event) {
      params.event = found.event;
      return undefined;
    }
  }

  return payload === 'event' ? undefined : resolveEvent(tournamentRecords, params);
}

// an event passed is resolved by its eventId and must be held; an eventId must name a held event
function resolveEvent(tournamentRecords: TournamentRecords, params: Params): Refusal {
  if (isObject(params.event)) {
    params.eventId ??= params.event?.eventId;
    delete params.event;
    if (!params.eventId) return { error: EVENT_NOT_FOUND };
  }
  if (!params.eventId) return undefined;
  const { event, tournamentId } = findEvent({ eventId: params.eventId, tournamentRecords });
  if (!event) return { error: EVENT_NOT_FOUND };
  params.tournamentId = tournamentId;
  params.event = event;
  return undefined;
}

// the params as the mismatch check reads them: a creation payload is not an entity in state, so its id is not compared
function payloadAside(params: Params, payload?: string): Params {
  if (!payload || !params[payload]) return params;
  const { [payload]: _payload, ...rest } = params;
  return rest;
}
