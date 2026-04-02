import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { modifyDrawNotice } from '../notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { refreshEntryPositions } from './refreshEntryPositions';
import { removeExtension } from '../extensions/removeExtension';
import { isValidExtension } from '@Validators/isValidExtension';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { addExtension } from '../extensions/addExtension';
import { findParticipant } from '@Acquire/findParticipant';
import { isUngrouped } from '@Query/entries/isUngrouped';

// Constants
import { INDIVIDUAL, PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { validStages } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT,
  INVALID_ENTRY_STATUS,
  INVALID_PARTICIPANT_ID,
  MISSING_EVENT,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  MISSING_VALUE,
  INVALID_VALUES,
  INVALID_STAGE,
} from '@Constants/errorConditionConstants';
import {
  ALTERNATE,
  DRAW_SPECIFIC_STATUSES,
  EQUIVALENT_ACCEPTANCE_STATUSES,
  VALID_ENTRY_STATUSES,
  WITHDRAWN,
} from '@Constants/entryStatusConstants';

import {
  DrawDefinition,
  Entry,
  EntryStatusUnion,
  Event,
  Extension,
  StageTypeUnion,
  Tournament,
} from '@Types/tournamentTypes';

// disallow changing entryStatus to WITHDRAWN or UNGROUPED for assignedParticipants
type ModifyEntriesStatusArgs = {
  drawDefinition?: DrawDefinition;
  autoEntryPositions?: boolean;
  tournamentRecord: Tournament;
  entryStatus?: EntryStatusUnion;
  ignoreAssignment?: boolean;
  entryStage?: StageTypeUnion;
  participantIds: string[];
  extension?: Extension;
  eventSync?: boolean;
  drawId: string;
  stage?: StageTypeUnion;
  event?: Event;
};
export function modifyEntriesStatus({
  autoEntryPositions = true,
  ignoreAssignment,
  tournamentRecord,
  drawDefinition,
  participantIds,
  entryStatus,
  entryStage,
  extension,
  eventSync,
  drawId,
  stage,
  event,
}: ModifyEntriesStatusArgs) {
  const validationError = validateModifyParams({ participantIds, drawDefinition, entryStatus, entryStage, extension, event });
  if (validationError) return validationError;

  const stack = 'modifyEntriesStatus';
  const modifiedDrawIds: string[] = [];

  const assignedParticipantIds = buildAssignedParticipantIds({ event, stage });
  const tournamentParticipants = tournamentRecord?.participants ?? [];

  if (!isValidEntryStatusForParticipants({ participantIds, tournamentParticipants, entryStatus, event }))
    return { error: INVALID_ENTRY_STATUS };

  const flightProfile = event && getFlightProfile({ event }).flightProfile;
  const flight = flightProfile?.flights?.find((f) => f.drawId === drawId);

  const updateEntryStatus = buildUpdateEntryStatus({
    assignedParticipantIds,
    ignoreAssignment,
    participantIds,
    entryStatus,
    entryStage,
    extension,
    stage,
  });

  const autoPosition = ({ flight: fl, drawDefinition: dd }) => {
    if (event) event.entries = refreshEntryPositions({ entries: event.entries ?? [] });
    if (fl) fl.drawEntries = refreshEntryPositions({ entries: fl.drawEntries });
    if (dd) dd.entries = refreshEntryPositions({ entries: dd.entries });
  };

  const updateDrawEntries = ({ flight: fl, drawDefinition: dd }) => {
    const innerStack = 'updateDrawEntries';
    if (fl) {
      const result = updateEntryStatus(fl.drawEntries);
      if (result.error) return decorateResult({ result, stack: innerStack });
    }
    if (dd) {
      const result = updateEntryStatus(dd.entries);
      if (result.error) return decorateResult({ result, stack: innerStack });
      if (!modifiedDrawIds.includes(dd.drawId)) modifiedDrawIds.push(dd.drawId);
    }
    return { ...SUCCESS };
  };

  const entryPositionsExist =
    event?.entries?.find(({ entryPosition }) => entryPosition) ??
    (flight?.drawEntries?.find(({ entryPosition }) => entryPosition) ||
      drawDefinition?.entries?.find(({ entryPosition }) => entryPosition));

  if (autoEntryPositions && !entryPositionsExist) autoPosition({ flight, drawDefinition });

  if (flight || drawDefinition) {
    const result = updateDrawEntries({ flight, drawDefinition });
    if (result.error) return decorateResult({ result, stack });
  }

  const generatedDrawIds = event?.drawDefinitions?.map(({ drawId: id }) => id) ?? [];
  const flightsNoDraw = flightProfile?.flights?.filter((f) => !generatedDrawIds.includes(f.drawId)) || [];

  for (const noDrawFlight of flightsNoDraw) {
    const result = noDrawFlight && updateDrawEntries({ flight: noDrawFlight, drawDefinition: undefined });
    if (result?.error) return decorateResult({ result, stack });
  }

  const singleDraw =
    flightProfile?.flights?.length === 1 && (event?.drawDefinitions?.length ?? 0) <= flightProfile?.flights?.length;

  if (!flight && !drawDefinition && entryStatus && DRAW_SPECIFIC_STATUSES.includes(entryStatus)) {
    return { error: ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT };
  }

  if ((!flight && !drawDefinition) || entryStatus === WITHDRAWN || (eventSync && singleDraw)) {
    const result = updateEntryStatus(event?.entries);
    if (result?.error) return decorateResult({ result, stack });

    if (entryStatus === WITHDRAWN) {
      const withdrawnError = withdrawFromAllFlightsAndDraws({ updateEntryStatus, participantIds, flightProfile, event });
      if (withdrawnError) return decorateResult({ result: { error: withdrawnError }, stack });
    }
  }

  if (autoEntryPositions) autoPosition({ flight, drawDefinition });

  for (const dd of event?.drawDefinitions ?? []) {
    if (modifiedDrawIds.length && !modifiedDrawIds.includes(dd.drawId)) continue;
    modifyDrawNotice({ tournamentId: tournamentRecord.tournamentId, eventId: event?.eventId, drawDefinition: dd });
  }

  return { ...SUCCESS };
}

function validateModifyParams({ participantIds, drawDefinition, entryStatus, entryStage, extension, event }) {
  if (!participantIds || !Array.isArray(participantIds))
    return { error: INVALID_PARTICIPANT_ID, method: 'modifyEntriesStatus', participantIds };
  if (!drawDefinition && !event) return { error: MISSING_EVENT };
  if (entryStatus && !VALID_ENTRY_STATUSES.includes(entryStatus)) return { error: INVALID_ENTRY_STATUS };
  if (entryStage && !validStages.includes(entryStage)) return { error: INVALID_STAGE };

  const stack = 'modifyEntriesStatus';
  if (!entryStatus && !extension)
    return decorateResult({ result: { error: MISSING_VALUE }, info: 'Missing entryStatus', stack });
  if (extension && !isValidExtension({ extension, requiredAttributes: ['name'] }))
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'Invalid extension', context: { extension }, stack });

  return undefined;
}

function buildAssignedParticipantIds({ event, stage }) {
  const assignedParticipantIds: string[] = [];
  event?.drawDefinitions?.forEach((dd) => {
    const ids = getAssignedParticipantIds({ stages: stage && [stage], drawDefinition: dd }).assignedParticipantIds ?? [];
    assignedParticipantIds.push(...ids);
  });
  return assignedParticipantIds;
}

function isValidEntryStatusForParticipants({ participantIds, tournamentParticipants, entryStatus, event }) {
  return participantIds.every((participantId) => {
    const participantType = findParticipant({ tournamentParticipants, participantId })?.participantType;
    return (
      !(participantType && [PAIR, TEAM_PARTICIPANT].includes(participantType) && isUngrouped(entryStatus)) &&
      !(
        entryStatus &&
        event?.eventType &&
        participantType === INDIVIDUAL &&
        [DOUBLES, TEAM_EVENT].includes(event.eventType) &&
        [ALTERNATE, ...EQUIVALENT_ACCEPTANCE_STATUSES].includes(entryStatus)
      )
    );
  });
}

function buildUpdateEntryStatus({ assignedParticipantIds, ignoreAssignment, participantIds, entryStatus, entryStage, extension, stage }) {
  return (entries?) => {
    const filteredEntries = (entries || [])
      .filter((entry: Entry) => !stage || !entry.entryStage || stage === entry.entryStage)
      .filter(({ participantId }) => participantIds.includes(participantId));

    const isAssigned = (entry) =>
      entryStatus &&
      assignedParticipantIds.includes(entry.participantId) &&
      !(EQUIVALENT_ACCEPTANCE_STATUSES.includes(entry.entryStatus) && EQUIVALENT_ACCEPTANCE_STATUSES.includes(entryStatus));

    const success = filteredEntries.every((entry: Entry) => {
      if (isAssigned(entry) && !ignoreAssignment) return false;
      if (entryStatus) { entry.entryStatus = entryStatus; delete entry.entryPosition; }
      if (entryStage) { entry.entryStage = entryStage; delete entry.entryPosition; }
      if (extension) {
        if (extension.value) { addExtension({ element: entry, extension }); }
        else { removeExtension({ element: entry, name: extension.name }); }
      }
      return true;
    });

    return success ? { ...SUCCESS } : { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT };
  };
}

function withdrawFromAllFlightsAndDraws({ updateEntryStatus, participantIds, flightProfile, event }) {
  const participantIdSet = new Set(participantIds);

  for (const flight of flightProfile?.flights ?? []) {
    const result: any = updateEntryStatus(flight.drawEntries);
    if (result.error) return result.error;
    flight.drawEntries = flight.drawEntries.filter(({ participantId }) => !participantIdSet.has(participantId));
  }

  for (const drawDef of event?.drawDefinitions ?? []) {
    const result: any = updateEntryStatus(drawDef.entries);
    if (result.error) return result.error;
    drawDef.entries = drawDef.entries?.filter(({ participantId }) => !participantIdSet.has(participantId));
  }

  return undefined;
}
