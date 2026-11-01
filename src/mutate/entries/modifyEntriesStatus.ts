import { modifyEventEntriesNotice, modifyDrawEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { entriesKey, eventAttributesKey } from '@Mutate/events/eventChangeNotice';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { refreshEntryPositions } from './refreshEntryPositions';
import { isValidExtension } from '@Validators/isValidExtension';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findParticipant } from '@Acquire/findParticipant';
import { isUngrouped } from '@Query/entries/isUngrouped';
import { moveEntryToGroup } from './moveEntryToGroup';

// constants
import { INDIVIDUAL, PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { validStages } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Flight } from '@Types/factoryTypes';
import {
  ALTERNATE,
  DRAW_SPECIFIC_STATUSES,
  EQUIVALENT_ACCEPTANCE_STATUSES,
  VALID_ENTRY_STATUSES,
  WITHDRAWN,
} from '@Constants/entryStatusConstants';
import {
  ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT,
  INVALID_ENTRY_STATUS,
  INVALID_PARTICIPANT_ID,
  MISSING_EVENT,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  PARTICIPANT_ENTRY_NOT_FOUND,
  MISSING_VALUE,
  INVALID_VALUES,
  INVALID_STAGE,
} from '@Constants/errorConditionConstants';

// types
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
  const validationError = validateModifyParams({
    participantIds,
    drawDefinition,
    entryStatus,
    entryStage,
    extension,
    event,
  });
  if (validationError) return validationError;

  const stack = 'modifyEntriesStatus';
  const modifiedDrawIds: string[] = [];
  let flightProfileModified = false; // a flight's drawEntries live in event.flightProfile

  const assignedParticipantIds = buildAssignedParticipantIds({ event, stage });
  const tournamentParticipants = tournamentRecord?.participants ?? [];

  if (!isValidEntryStatusForParticipants({ participantIds, tournamentParticipants, entryStatus, event }))
    return { error: INVALID_ENTRY_STATUS };

  const flightProfile = event && getFlightProfile({ event }).flightProfile;
  const flight = flightProfile?.flights?.find((f) => f.drawId === drawId);

  // What the flags below miss (re-sequenced entryPositions, a WITHDRAWN cascade through every flight
  // and draw) is caught by comparing each entries list, and the event's flight profile, at the end.
  const snapshot = snapshotEntries({ drawDefinition, event });

  const { updateEntryStatus, entryStatusBlocked } = buildUpdateEntryStatus({
    assignedParticipantIds,
    ignoreAssignment,
    participantIds,
    entryStatus,
    entryStage,
    extension,
    stage,
  });

  const autoPosition = ({ flight: fl, drawDefinition: dd }: { flight?: Flight; drawDefinition?: DrawDefinition }) => {
    if (event) event.entries = refreshEntryPositions({ entries: event.entries ?? [] });
    if (fl) {
      fl.drawEntries = refreshEntryPositions({ entries: fl.drawEntries });
      flightProfileModified = true;
    }
    if (dd) dd.entries = refreshEntryPositions({ entries: dd.entries });
  };

  const updateDrawEntries = ({
    flight: fl,
    drawDefinition: dd,
  }: {
    flight?: Flight;
    drawDefinition?: DrawDefinition;
  }) => {
    const innerStack = 'updateDrawEntries';
    if (fl) {
      const result = updateEntryStatus(fl.drawEntries);
      if (result.error) return decorateResult({ result, stack: innerStack });
      flightProfileModified = true;
    }
    if (dd) {
      const result = updateEntryStatus(dd.entries);
      if (result.error) return decorateResult({ result, stack: innerStack });
      if (!modifiedDrawIds.includes(dd.drawId)) modifiedDrawIds.push(dd.drawId);
    }
    return { ...SUCCESS };
  };

  const generatedDrawIds = event?.drawDefinitions?.map(({ drawId: id }) => id) ?? [];
  const flightsNoDraw = flightProfile?.flights?.filter((f) => !generatedDrawIds.includes(f.drawId)) ?? [];

  const singleDraw =
    flightProfile?.flights?.length === 1 && (event?.drawDefinitions?.length ?? 0) <= flightProfile?.flights?.length;

  if (!flight && !drawDefinition && entryStatus && DRAW_SPECIFIC_STATUSES.includes(entryStatus)) {
    return { error: ENTRY_STATUS_NOT_ALLOWED_FOR_EVENT };
  }

  const updateEventEntries = !!((!flight && !drawDefinition) || entryStatus === WITHDRAWN || (eventSync && singleDraw));

  // Refuse before writing: with a draw scope, each participant must have an entry this call will change.
  const notInScope = participantsNotInScope({ participantIds, updateEventEntries, drawDefinition, flight, event });
  if (notInScope.length)
    return decorateResult({
      result: { error: PARTICIPANT_ENTRY_NOT_FOUND },
      info: 'Participants not entered in the draw or flight',
      context: { participantIds: notInScope, drawId },
      stack,
    });

  // Refuse before writing: every entries list this call will touch is checked before any is modified.
  const targetEntryLists = getTargetEntryLists({
    updateEventEntries,
    drawDefinition,
    flightsNoDraw,
    flightProfile,
    entryStatus,
    flight,
    event,
  });
  if (targetEntryLists.some(entryStatusBlocked))
    return decorateResult({ result: { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT }, stack });

  const entryPositionsExist =
    event?.entries?.find(({ entryPosition }) => entryPosition) ??
    flight?.drawEntries?.find(({ entryPosition }) => entryPosition) ??
    drawDefinition?.entries?.find(({ entryPosition }) => entryPosition);

  if (autoEntryPositions && !entryPositionsExist) autoPosition({ flight, drawDefinition });

  if (flight || drawDefinition) {
    const result = updateDrawEntries({ flight, drawDefinition });
    if (result.error) return decorateResult({ result, stack });
  }

  for (const noDrawFlight of flightsNoDraw) {
    const result = noDrawFlight && updateDrawEntries({ flight: noDrawFlight, drawDefinition: undefined });
    if (result?.error) return decorateResult({ result, stack });
  }

  let eventEntriesModified = false;
  if (updateEventEntries) {
    const result = updateEntryStatus(event?.entries);
    if (result?.error) return decorateResult({ result, stack });
    eventEntriesModified = !!event?.entries;

    if (entryStatus === WITHDRAWN) {
      const withdrawnError = withdrawFromAllFlightsAndDraws({
        updateEntryStatus,
        participantIds,
        flightProfile,
        event,
      });
      if (withdrawnError) return decorateResult({ result: { error: withdrawnError }, stack });
    }
  }

  if (autoEntryPositions) autoPosition({ flight, drawDefinition });

  const changed = changedSinceSnapshot({ snapshot, modifiedDrawIds, event });

  dispatchEntriesStatusNotices({
    flightProfileModified: flightProfileModified || changed.event,
    eventEntriesModified: eventEntriesModified || changed.eventEntries,
    drawDefinitions: snapshot.drawDefinitions,
    tournamentRecord,
    modifiedDrawIds,
    event,
  });

  return { ...SUCCESS };
}

// Notices for a status change: MODIFY_DRAW_DEFINITION for each affected draw plus
// MODIFY_DRAW_ENTRIES for any draw whose entries were updated; MODIFY_EVENT_ENTRIES
// when event.entries statuses changed; and MODIFY_EVENT when a flight's drawEntries
// (which live in event.flightProfile) were re-sequenced.
type EntriesSnapshot = {
  drawEntries: Map<string, string>;
  drawDefinitions: DrawDefinition[];
  eventEntries: string;
  event?: string;
};
function snapshotEntries({ drawDefinition, event }: { drawDefinition?: DrawDefinition; event?: Event }) {
  const drawDefinitions: DrawDefinition[] = event?.drawDefinitions ?? (drawDefinition ? [drawDefinition] : []);
  return {
    drawEntries: new Map(drawDefinitions.map((dd) => [dd.drawId, entriesKey(dd.entries)])),
    eventEntries: entriesKey(event?.entries),
    event: eventAttributesKey(event),
    drawDefinitions,
  };
}

// adds each draw whose entries changed to modifiedDrawIds; reports event entries and attributes
function changedSinceSnapshot({
  modifiedDrawIds,
  snapshot,
  event,
}: {
  snapshot: EntriesSnapshot;
  modifiedDrawIds: string[];
  event?: Event;
}) {
  for (const dd of snapshot.drawDefinitions) {
    const changed = entriesKey(dd.entries) !== snapshot.drawEntries.get(dd.drawId);
    if (changed && !modifiedDrawIds.includes(dd.drawId)) modifiedDrawIds.push(dd.drawId);
  }
  return {
    eventEntries: !!event && entriesKey(event.entries) !== snapshot.eventEntries,
    event: !!event && eventAttributesKey(event) !== snapshot.event,
  };
}

type DispatchEntriesStatusNoticesArgs = {
  drawDefinitions: DrawDefinition[];
  flightProfileModified: boolean;
  eventEntriesModified: boolean;
  tournamentRecord?: Tournament;
  modifiedDrawIds: string[];
  event?: Event;
};
function dispatchEntriesStatusNotices({
  eventEntriesModified,
  flightProfileModified,
  tournamentRecord,
  drawDefinitions,
  modifiedDrawIds,
  event,
}: DispatchEntriesStatusNoticesArgs) {
  const tournamentId = tournamentRecord?.tournamentId;
  const eventId = event?.eventId;
  for (const dd of drawDefinitions) {
    if (modifiedDrawIds.length && !modifiedDrawIds.includes(dd.drawId)) continue;
    modifyDrawNotice({ tournamentId, eventId, drawDefinition: dd });
    if (modifiedDrawIds.includes(dd.drawId)) modifyDrawEntriesNotice({ drawDefinition: dd, tournamentId, eventId });
  }
  if (eventEntriesModified && event) {
    modifyEventEntriesNotice({ event, tournamentId });
  }
  if (flightProfileModified && event) {
    modifyEventNotice({ tournamentId, event });
  }
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
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'Invalid extension',
      context: { extension },
      stack,
    });

  return undefined;
}

function buildAssignedParticipantIds({ event, stage }) {
  const assignedParticipantIds: string[] = [];
  event?.drawDefinitions?.forEach((dd) => {
    const ids =
      getAssignedParticipantIds({ stages: stage && [stage], drawDefinition: dd }).assignedParticipantIds ?? [];
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

function buildUpdateEntryStatus({
  assignedParticipantIds,
  ignoreAssignment,
  participantIds,
  entryStatus,
  entryStage,
  extension,
  stage,
}) {
  const filterEntries = (entries?: Entry[]) =>
    (entries ?? [])
      .filter((entry: Entry) => !stage || !entry.entryStage || stage === entry.entryStage)
      .filter(({ participantId }) => participantIds.includes(participantId));

  const isAssigned = (entry) =>
    entryStatus &&
    assignedParticipantIds.includes(entry.participantId) &&
    !(
      EQUIVALENT_ACCEPTANCE_STATUSES.includes(entry.entryStatus) && EQUIVALENT_ACCEPTANCE_STATUSES.includes(entryStatus)
    );

  // pure: true when any targeted entry in the list is assigned a draw position and may not change
  const entryStatusBlocked = (entries?: Entry[]) => !ignoreAssignment && filterEntries(entries).some(isAssigned);

  const updateEntryStatus = (entries?: Entry[]) => {
    if (entryStatusBlocked(entries)) return { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT };

    // in the order of participantIds, so entries moved to one group take its next positions in the order given
    const list = entries ?? [];
    const targeted = filterEntries(list).sort(
      (a, b) => participantIds.indexOf(a.participantId) - participantIds.indexOf(b.participantId),
    );
    targeted.forEach((entry: Entry) => {
      if (entryStatus || entryStage) moveEntryToGroup({ entries: list, entry, entryStatus, entryStage });
      if (extension) {
        if (extension.value) {
          addExtension({ element: entry, extension });
        } else {
          removeExtension({ element: entry, name: extension.name });
        }
      }
    });

    return { ...SUCCESS };
  };

  return { updateEntryStatus, entryStatusBlocked };
}

/**
 * With a draw scope (a flight or drawDefinition), the participantIds that have no entry in the flight's drawEntries
 * or the draw's entries, nor in the event's entries when the call also updates those (WITHDRAWN, eventSync). Such a
 * participant would be left unchanged while the call reported success. Without a draw scope, none.
 */
type ParticipantsNotInScopeArgs = {
  drawDefinition?: DrawDefinition;
  updateEventEntries: boolean;
  participantIds: string[];
  flight?: Flight;
  event?: Event;
};
function participantsNotInScope({
  updateEventEntries,
  participantIds,
  drawDefinition,
  flight,
  event,
}: ParticipantsNotInScopeArgs): string[] {
  if (!flight && !drawDefinition) return [];
  const lists = [flight?.drawEntries, drawDefinition?.entries, updateEventEntries ? event?.entries : undefined];
  const entered = new Set(lists.flatMap((entries) => (entries ?? []).map(({ participantId }) => participantId)));
  return participantIds.filter((participantId) => !entered.has(participantId));
}

// every entries list modifyEntriesStatus will pass to updateEntryStatus, in the order it does so
type GetTargetEntryListsArgs = {
  flightProfile?: { flights?: Flight[] };
  drawDefinition?: DrawDefinition;
  entryStatus?: EntryStatusUnion;
  updateEventEntries: boolean;
  flightsNoDraw: Flight[];
  flight?: Flight;
  event?: Event;
};
function getTargetEntryLists({
  updateEventEntries,
  drawDefinition,
  flightsNoDraw,
  flightProfile,
  entryStatus,
  flight,
  event,
}: GetTargetEntryListsArgs): (Entry[] | undefined)[] {
  const lists: (Entry[] | undefined)[] = [flight?.drawEntries, drawDefinition?.entries];
  flightsNoDraw.forEach((f) => lists.push(f?.drawEntries));
  if (updateEventEntries) {
    lists.push(event?.entries);
    if (entryStatus === WITHDRAWN) {
      flightProfile?.flights?.forEach((f) => lists.push(f.drawEntries));
      event?.drawDefinitions?.forEach((dd) => lists.push(dd.entries));
    }
  }
  return lists;
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
