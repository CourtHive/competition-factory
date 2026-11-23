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
      getParticipantAdded = () => installedPairId(tournamentRecord, pair.existing);
    } else {
      if (pair && 'participantName' in pair) participant.participantName = pair.participantName;
      writes.push(() => {
        tournamentRecord.participants!.push(participant);
      });
      getParticipantAdded = () => installedPairId(tournamentRecord, participant);
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
  const pruned: Participant[] = [];
  current.forEach((p) => {
    if (removed.has(p.participantId)) return;
    if (p.participantType !== TEAM && p.participantType !== GROUP) return;
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
  });
  // An append or array replacement can install cast subdocuments. Carry those committed objects forward.
  writes.push(() => {
    tournamentRecord.participants = tournamentRecord.participants!.filter((p) => !removed.has(p.participantId));
    for (const grouping of tournamentRecord.participants) {
      if (grouping.participantType !== TEAM && grouping.participantType !== GROUP) continue;
      if (grouping.participantRole && grouping.participantRole !== COMPETITOR) continue;
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

/** A roster setter may reorder entries and canonicalize IDs. Read the pair from the installed roster. */
function installedPairId(tournamentRecord: Tournament, pair: Participant) {
  const pairs = tournamentRecord.participants ?? [];
  const byId = pairs.find((p) => p.participantType === PAIR && p.participantId === pair.participantId);
  if (byId) return byId.participantId;
  const members = JSON.stringify(pair.individualParticipantIds?.slice().sort());
  return pairs.find(
    (p) => p.participantType === PAIR && JSON.stringify(p.individualParticipantIds?.slice().sort()) === members,
  )?.participantId;
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

/** Expose schema fields to queries that spread the view, without serializing borrowed documents. */
function projectFields<T extends object>(entity: T, changes: Partial<T>): T {
  if (!('$__' in entity && '_doc' in entity && entity._doc && typeof entity._doc === 'object')) {
    return { ...entity, ...changes };
  }

  // Mongoose stores the enumerable field names in _doc. Read values through the document's getters.
  const view = Object.create(entity, Object.getOwnPropertyDescriptors(changes));
  for (const key of Object.keys(entity._doc)) {
    if (!Object.hasOwn(view, key)) {
      Object.defineProperty(view, key, { enumerable: true, get: () => Reflect.get(entity, key) });
    }
  }
  return view;
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
      return projectFields(structure, {
        matchUps: structure.matchUps.map((m) => (m === dualMatchUp ? projectFields(m, { sides }) : m)),
      });
    if ('structures' in structure && structure.structures?.length) {
      const children = structure.structures;
      const structures = children.map(replaceDual);
      if (structures.some((child, i) => child !== children[i])) return projectFields(structure, { structures });
    }
    return structure;
  };
  const draw = projectFields(drawDefinition, {
    structures: drawDefinition.structures?.map(replaceDual),
    ...(lineUps !== undefined && { lineUps }),
  });
  const events = tournamentRecord.events?.map((e) =>
    e !== event
      ? e
      : projectFields(e, {
          drawDefinitions: e.drawDefinitions?.map((d) => (d === drawDefinition ? draw : d)),
        }),
  );
  return projectFields(tournamentRecord, { participants, events });
}
