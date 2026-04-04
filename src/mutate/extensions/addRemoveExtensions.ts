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
  return addExtension({
    creationTime: params.creationTime,
    element: params.tournamentRecord,
    extension: params.extension,
  });
}

export function addDrawDefinitionExtension(params: AddExtensionArgs) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  return addExtension({
    creationTime: params.creationTime,
    element: params.drawDefinition,
    extension: params.extension,
  });
}

export function addEventExtension(params: AddExtensionArgs) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.event) return { error: EVENT_NOT_FOUND };
  return addExtension({
    creationTime: params.creationTime,
    extension: params.extension,
    element: params.event,
  });
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
  return removeExtension({
    element: params.tournamentRecord,
    name: params.name,
  });
}

export function removeDrawDefinitionExtension(params) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  return removeExtension({ element: params.drawDefinition, name: params.name });
}

export function removeEventExtension(params) {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params?.event) return { error: EVENT_NOT_FOUND };
  return removeExtension({ element: params.event, name: params.name });
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
