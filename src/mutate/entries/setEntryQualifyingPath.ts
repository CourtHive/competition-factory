import { modifyDrawEntriesNotice, modifyEventEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { EVENT, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_STAGE,
  INVALID_VALUES,
  MISSING_VALUE,
  PARTICIPANT_ENTRY_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type SetEntryQualifyingPathArgs = {
  tournamentRecord: Tournament;
  drawDefinition?: DrawDefinition;
  entryStageSequence?: number;
  participantIds: string[];
  roundTarget?: number;
  drawId?: string;
  event: Event;
};

/**
 * Sets the path a QUALIFYING entry takes to MAIN: `entryStageSequence`, how deep in the qualifying chain it starts (1 is
 * the deepest: pre-qualifying, then qualifying), and `roundTarget`, the MAIN round its chain leads to. The topology
 * builder decides both from the structures the director draws (CA, 2026-11-18); generation reads them to seat each
 * entry in its structure. `addEventEntries` sets them only as entries are added; this sets them on existing entries.
 *
 * With a `drawId`, the entries of that draw (and its flight) change; without one, the event's entries and every
 * flight's and draw's copy of them. Every named participant must have a QUALIFYING entry in scope, and nothing changes
 * unless all do.
 */
export function setEntryQualifyingPath(params: SetEntryQualifyingPathArgs): ResultType {
  const stack = 'setEntryQualifyingPath';
  const { tournamentRecord, drawDefinition, entryStageSequence, participantIds, roundTarget, event } = params;
  const paramsCheck = requireParams(params, [TOURNAMENT_RECORD, EVENT], stack);
  if (paramsCheck.error) return paramsCheck;
  if (!Array.isArray(participantIds) || !participantIds.length)
    return decorateResult({ result: { error: INVALID_PARTICIPANT_IDS }, stack });

  if (entryStageSequence === undefined && roundTarget === undefined)
    return decorateResult({ result: { error: MISSING_VALUE }, info: 'entryStageSequence or roundTarget', stack });
  for (const [name, value] of Object.entries({ entryStageSequence, roundTarget })) {
    if (value !== undefined && !(Number.isSafeInteger(value) && value >= 1))
      return decorateResult({ result: { error: INVALID_VALUES }, context: { [name]: value }, stack });
  }

  const flightProfile = getFlightProfile({ event }).flightProfile;
  const drawId = drawDefinition?.drawId ?? params.drawId;
  const flights = (flightProfile?.flights ?? []).filter((flight) => !drawId || flight.drawId === drawId);
  const drawDefinitions = (event.drawDefinitions ?? []).filter((dd) => !drawId || dd.drawId === drawId);
  const scopes = [
    ...(drawId ? [] : [event.entries ?? []]),
    ...flights.map((flight) => flight.drawEntries ?? []),
    ...drawDefinitions.map((dd) => dd.entries ?? []),
  ];

  // validate every entry before changing any
  const ids = new Set(participantIds);
  const targets = scopes.flatMap((entries) => entries.filter((entry) => ids.has(entry.participantId)));
  const found = new Set(targets.map((entry) => entry.participantId));
  const missing = participantIds.filter((participantId) => !found.has(participantId));
  if (missing.length)
    return decorateResult({ result: { error: PARTICIPANT_ENTRY_NOT_FOUND }, context: { missing }, stack });
  const notQualifying = targets.filter((entry) => entry.entryStage !== QUALIFYING);
  if (notQualifying.length)
    return decorateResult({
      result: { error: INVALID_STAGE },
      context: { participantIds: [...new Set(notQualifying.map((entry) => entry.participantId))] },
      info: 'only QUALIFYING entries have a qualifying path',
      stack,
    });

  for (const entry of targets) {
    if (entryStageSequence !== undefined) entry.entryStageSequence = entryStageSequence;
    if (roundTarget !== undefined)
      setFirstClassOrExtension({ element: entry, attribute: 'roundTarget', name: ROUND_TARGET, value: roundTarget });
  }

  const tournamentId = tournamentRecord.tournamentId;
  const eventId = event.eventId;
  if (!drawId) modifyEventEntriesNotice({ event, tournamentId });
  // a flight's drawEntries live in the event's flight profile
  if (flights.length) modifyEventNotice({ tournamentId, event });
  for (const dd of drawDefinitions) {
    modifyDrawEntriesNotice({ drawDefinition: dd, tournamentId, eventId });
    modifyDrawNotice({ drawDefinition: dd, tournamentId, eventId });
  }

  return { ...SUCCESS };
}
