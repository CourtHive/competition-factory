import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addParticipants } from '../participants/addParticipants';
import { intersection } from '@Tools/arrays';

import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';

import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import { EntryStatusUnion, Event, Tournament } from '@Types/tournamentTypes';

// should NOT remove entries that are present in drawDefinition.entries
// if those entries are assigned positions in any structures...
type ModifyEventEntriesArgs = {
  unpairedParticipantIds?: string[];
  participantIdPairs?: string[][];
  entryStatus?: EntryStatusUnion;
  tournamentRecord: Tournament;
  entryStage?: string;
  event: Event;
};
export function modifyEventEntries({
  entryStatus = DIRECT_ACCEPTANCE,
  unpairedParticipantIds = [],
  participantIdPairs = [],
  entryStage = MAIN,
  tournamentRecord,
  event,
}: ModifyEventEntriesArgs) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const tournamentParticipants = tournamentRecord.participants ?? [];
  const individualParticipantIds = tournamentParticipants
    .filter((participant) => participant.participantType === INDIVIDUAL)
    .map((participant) => participant.participantId);

  // concat all incoming INDIVIDUAL participantIds
  const incomingIndividualParticipantIds = unpairedParticipantIds.concat(...participantIdPairs).flat(Infinity);

  // ensure all participants are present in the tournament record
  const invalidParticipantIds = incomingIndividualParticipantIds.filter(
    (participantId) => !individualParticipantIds.includes(participantId),
  );
  if (invalidParticipantIds.length) return { error: INVALID_PARTICIPANT_IDS, invalidParticipantIds };

  // ensure all participantIdPairs have two individual participantIds
  const invalidParticipantIdPairs = participantIdPairs.filter((pair) => pair.length !== 2);
  if (invalidParticipantIdPairs.length) return { error: INVALID_PARTICIPANT_IDS, invalidParticipantIdPairs };

  // make an array of all existing PAIR participantIds
  const existingParticipantIdPairs = tournamentParticipants
    .filter((participant) => participant.participantType === PAIR)
    .map((participant) => participant.individualParticipantIds);

  // determine participantIdPairs which do not already exist
  const newParticipantIdPairs = participantIdPairs.filter(
    (incoming) => !existingParticipantIdPairs.find((existing) => intersection(existing, incoming).length === 2),
  );

  // create new participant objects
  const newParticipants: any[] = newParticipantIdPairs.map((individualParticipantIds) => ({
    participantType: PAIR,
    participantRole: COMPETITOR,
    individualParticipantIds,
  }));

  const result = addParticipants({
    participants: newParticipants,
    tournamentRecord,
  });

  if (result.error) return result;

  // get all participantIds for PAIR participants
  const pairParticipantEntries: any[] = participantIdPairs
    .map((participantIds: string[]) => {
      const { participant } = getPairedParticipant({
        tournamentRecord,
        participantIds,
      });
      return participant;
    })
    .map((participantId) => ({
      participantId,
      entryStatus,
      entryStage,
    }));

  const unpairedParticipantEntries: any[] = unpairedParticipantIds.map((participantId) => ({
    entryStatus: UNGROUPED,
    participantId,
    entryStage,
  }));

  // remove all entries matching the stage which has been modified
  event.entries = (event.entries ?? []).filter((entry) => entry.entryStage === entryStage);

  event.entries = event.entries.concat(...pairParticipantEntries, ...unpairedParticipantEntries);

  return { ...SUCCESS };
}
