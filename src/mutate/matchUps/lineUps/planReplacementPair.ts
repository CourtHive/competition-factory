import { planModifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { resolveParticipantRemoval } from '@Mutate/participants/deleteParticipants';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { planPairParticipant } from '@Mutate/participants/planPairParticipant';
import { refreshEntryPositions } from '@Mutate/entries/refreshEntryPositions';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { planFieldWrite } from '@Mutate/planCommit';
import { UUID } from '@Tools/UUID';

// constants and types
import { PARTICIPANT_ID_EXISTS } from '@Constants/errorConditionConstants';
import { GROUP, PAIR, TEAM } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import {
  ADD_PARTICIPANTS,
  DELETE_PARTICIPANTS,
  MODIFY_DRAW_ENTRIES,
  MODIFY_EVENT,
  MODIFY_EVENT_ENTRIES,
} from '@Constants/topicConstants';

import type { DrawDefinition, Event, MatchUp, Participant, Structure, Tournament } from '@Types/tournamentTypes';
import type { Notice } from '@Global/state/globalState';
import type { ResultType } from '@Types/factoryTypes';

type ReplacementView = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  dualMatchUp: MatchUp;
  sides: MatchUp['sides'];
  lineUps: DrawDefinition['lineUps'];
  event: Event;
};

type PlannedRemoval = { writes: (() => void)[]; notices: (Notice | (() => Notice))[] };

export function planReplacementPair({
  existingIndividualParticipantIds,
  individualParticipantIds,
  tournamentRecord,
  dualMatchUp,
  drawDefinition,
  event,
  sides,
  lineUps,
  writes,
  notices,
  stack,
}: ReplacementView &
  PlannedRemoval & {
    existingIndividualParticipantIds: string[];
    individualParticipantIds: string[];
    stack: string;
  }): ResultType & { getParticipantAdded?: () => string | undefined; participantRemoved?: string } {
  const current = tournamentRecord.participants ?? [];
  let forLookup = current;
  let addedPosition: number | undefined;
  let getParticipantAdded: (() => string | undefined) | undefined;
  if (!getPairedParticipant({ participantIds: individualParticipantIds, tournamentRecord }).participant) {
    const participantId = UUID();
    if (current.some((p) => p.participantId === participantId)) {
      const result = decorateResult({ result: { error: PARTICIPANT_ID_EXISTS }, stack: 'addParticipant' });
      return decorateResult({ result, stack });
    }
    const participant: Participant = {
      participantType: PAIR,
      participantRole: COMPETITOR,
      individualParticipantIds,
      participantId,
    };
    const pair = planPairParticipant({ participant, tournamentParticipants: current, pairOverride: true });
    if (pair && 'error' in pair) return decorateResult({ result: pair, stack });
    if (pair && 'existing' in pair) {
      getParticipantAdded = () => pair.existing.participantId;
    } else {
      if (pair && 'participantName' in pair) participant.participantName = pair.participantName;
      const position = current.length;
      addedPosition = position;
      writes.push(() => {
        tournamentRecord.participants!.push(participant);
      });
      getParticipantAdded = () => tournamentRecord.participants![position].participantId;
      notices.push({
        topic: ADD_PARTICIPANTS,
        payload: { tournamentId: tournamentRecord.tournamentId, participants: [participant] },
      });
      forLookup = [...current, participant];
    }
  }
  const old = getPairedParticipant({
    participantIds: existingIndividualParticipantIds,
    tournamentParticipants: forLookup,
  }).participant;
  if (!old?.participantId) return { getParticipantAdded };

  // The old pair may still play another line. Hydrate against the proposed sides and reference template.
  const view = replacementView({
    tournamentRecord,
    drawDefinition,
    dualMatchUp,
    event,
    sides,
    lineUps,
    participants: forLookup,
  });
  const id = old.participantId;
  const removal = resolveParticipantRemoval({ tournamentRecord: view, participantIds: [id] });
  if ('error' in removal) return { getParticipantAdded };
  planRemovedPairEntries({ tournamentRecord, ids: removal.entryParticipantIds, writes, notices });
  const removed = new Set(removal.entryParticipantIds);
  const retainedPositions = forLookup.flatMap((p, i) => (removed.has(p.participantId) ? [] : [i]));
  const finalAddedPosition = addedPosition === undefined ? undefined : retainedPositions.indexOf(addedPosition);
  if (finalAddedPosition !== undefined && finalAddedPosition >= 0)
    getParticipantAdded = () => tournamentRecord.participants![finalAddedPosition].participantId;
  const pruned: Participant[] = [];
  const refreshed: number[] = [];
  retainedPositions.forEach((sourcePosition, retainedPosition) => {
    const p = current[sourcePosition];
    if (!p || (p.participantType !== TEAM && p.participantType !== GROUP)) return;
    const members = p.individualParticipantIds;
    const contacts = p.contactParticipantIds;
    const pruneMembers = members?.includes(id);
    const pruneContacts = contacts?.includes(id);
    if (pruneMembers && members)
      writes.push(
        planFieldWrite(
          p,
          'individualParticipantIds',
          members.filter((member) => member !== id),
        ),
      );
    if (pruneContacts && contacts)
      writes.push(
        planFieldWrite(
          p,
          'contactParticipantIds',
          contacts.filter((member) => member !== id),
        ),
      );
    if (pruneMembers || pruneContacts) pruned.push(p);
    if (!p.participantRole || p.participantRole === COMPETITOR) refreshed.push(retainedPosition);
  });
  // An append or array replacement can install cast subdocuments. Carry those committed objects forward.
  writes.push(() => {
    const participants = tournamentRecord.participants!;
    tournamentRecord.participants = retainedPositions.map((i) => participants[i]);
    for (const position of refreshed) {
      const grouping = tournamentRecord.participants[position];
      grouping.individualParticipantIds = (grouping.individualParticipantIds ?? []).filter((member) => member !== id);
    }
  });
  const { tournamentId } = tournamentRecord;
  notices.push({
    topic: DELETE_PARTICIPANTS,
    payload: {
      participantIds: forLookup.filter((p) => removed.has(p.participantId)).map((p) => p.participantId),
      tournamentId,
    },
  });
  const modified = planModifyParticipantsNotice({ tournamentId, participants: pruned });
  if (modified) notices.push(modified);
  return { getParticipantAdded, participantRemoved: id };
}

function planRemovedPairEntries({
  tournamentRecord,
  ids,
  writes,
  notices,
}: PlannedRemoval & { tournamentRecord: Tournament; ids: string[] }) {
  for (const event of tournamentRecord.events ?? []) {
    const keep = (entry: { participantId: string }) => !ids.includes(entry?.participantId);
    writes.push(planFieldWrite(event, 'entries', (event.entries ?? []).filter(keep)));
    writes.push(() => {
      event.entries = refreshEntryPositions({ entries: event.entries });
    });
    let flightsChanged = false;
    for (const flight of getFlightProfile({ event }).flightProfile?.flights ?? []) {
      const prior = flight.drawEntries ?? [];
      const next = prior.filter(keep);
      writes.push(planFieldWrite(flight, 'drawEntries', next));
      flightsChanged ||= next.length !== prior.length;
    }
    const { eventId } = event;
    if (flightsChanged)
      notices.push({ topic: MODIFY_EVENT, key: eventId, payload: { tournamentId: undefined, event } });
    for (const draw of event.drawDefinitions ?? []) {
      const prior = draw.entries ?? [];
      const next = prior.filter(keep);
      writes.push(planFieldWrite(draw, 'entries', next));
      if (prior.length !== next.length && draw.drawId)
        notices.push(() => ({
          topic: MODIFY_DRAW_ENTRIES,
          key: draw.drawId,
          payload: { tournamentId: undefined, eventId, drawId: draw.drawId, drawEntries: draw.entries ?? [] },
        }));
    }
    notices.push(() => ({
      topic: MODIFY_EVENT_ENTRIES,
      key: eventId,
      payload: { tournamentId: undefined, eventId, entries: event.entries ?? [] },
    }));
  }
}

function replacementView({
  tournamentRecord,
  drawDefinition,
  dualMatchUp,
  event,
  sides,
  lineUps,
  participants,
}: ReplacementView & { participants: Participant[] }) {
  const replaceDual = (structure: Structure): Structure => {
    if ('matchUps' in structure && structure.matchUps?.includes(dualMatchUp))
      return {
        ...structure,
        matchUps: structure.matchUps.map((m) => (m === dualMatchUp ? { ...m, sides } : m)),
      };
    if ('structures' in structure && structure.structures?.length)
      return { ...structure, structures: structure.structures.map(replaceDual) };
    return structure;
  };
  const draw = { ...drawDefinition, structures: drawDefinition.structures?.map(replaceDual) };
  if (lineUps !== undefined) draw.lineUps = lineUps;
  const events = tournamentRecord.events?.map((e) =>
    e !== event
      ? e
      : {
          ...e,
          drawDefinitions: e.drawDefinitions?.map((d) => (d === drawDefinition ? draw : d)),
        },
  );
  return { ...tournamentRecord, participants, events };
}
