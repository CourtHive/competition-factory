import { rootExtensionsFingerprint, rootExtensionsNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { announceDrawChange, attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { withEventChangeNotice } from '@Mutate/events/eventChangeNotice';
import { findParticipant } from '@Acquire/findParticipant';
import { removeExtension } from './removeExtension';
import { addExtension } from './addExtension';

// constants and types
import { DrawDefinition, Event, Extension, Tournament } from '@Types/tournamentTypes';
import {
  DRAW_DEFINITION_NOT_FOUND,
  EVENT_NOT_FOUND,
  ErrorType,
  MISSING_PARTICIPANT_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type AddExtensionArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  participantId?: string;
  disableNotice?: boolean;
  creationTime?: boolean;
  extension: Extension;
  event?: Event;
};

export function addTournamentExtension(params: AddExtensionArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const before = rootExtensionsFingerprint(params.tournamentRecord);
  const result = addExtension({
    creationTime: params.creationTime,
    element: params.tournamentRecord,
    extension: params.extension,
  });
  if (!result.error) rootExtensionsNotice({ tournamentRecord: params.tournamentRecord, before });
  return result;
}

export function addDrawDefinitionExtension(params: AddExtensionArgs) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  const { tournamentRecord, drawDefinition, disableNotice, event } = params;
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  const before = attributesSnapshot(drawDefinition, []);
  const result = addExtension({
    creationTime: params.creationTime,
    extension: params.extension,
    element: drawDefinition,
  });
  if (!result.error && !disableNotice) {
    announceDrawChange({ tournamentRecord, drawDefinition, attributes: [], before, event });
  }
  return result;
}

// an event's extensions are event attributes: a change to them is announced with MODIFY_EVENT
export function addEventExtension(params: AddExtensionArgs) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  const event = params.event;
  if (!event) return { error: EVENT_NOT_FOUND };
  return withEventChangeNotice(params, () =>
    addExtension({
      creationTime: params.creationTime,
      extension: params.extension,
      element: event,
    }),
  );
}

export function addParticipantExtension(params?) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.participantId) return { error: MISSING_PARTICIPANT_ID };
  const tournamentParticipants = params.tournamentRecord?.participants ?? [];
  const participant = findParticipant({
    participantId: params.participantId,
    tournamentParticipants,
  });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };
  return addExtension({
    creationTime: params.creationTime,
    extension: params.extension,
    element: participant,
  });
}

export function removeTournamentExtension(params): {
  success?: boolean;
  error?: ErrorType;
  info?: any;
} {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const before = rootExtensionsFingerprint(params.tournamentRecord);
  const result = removeExtension({
    element: params.tournamentRecord,
    name: params.name,
  });
  if (!result.error) rootExtensionsNotice({ tournamentRecord: params.tournamentRecord, before });
  return result;
}

export function removeDrawDefinitionExtension(params) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  const { tournamentRecord, drawDefinition, disableNotice, event } = params;
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  const before = attributesSnapshot(drawDefinition, []);
  const result = removeExtension({ element: drawDefinition, name: params.name });
  if (!result.error && !disableNotice) {
    announceDrawChange({ tournamentRecord, drawDefinition, attributes: [], before, event });
  }
  return result;
}

export function removeEventExtension(params) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params?.event) return { error: EVENT_NOT_FOUND };
  return withEventChangeNotice(params, () => removeExtension({ element: params.event, name: params.name }));
}

export function removeParticipantExtension(params?) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.participantId) return { error: MISSING_PARTICIPANT_ID };
  const tournamentParticipants = params.tournamentRecord?.participants ?? [];
  const participant = findParticipant({
    participantId: params.participantId,
    tournamentParticipants,
  });

  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  return removeExtension({ element: participant, name: params.name });
}
