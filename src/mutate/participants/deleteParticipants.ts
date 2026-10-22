import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { removeParticipantIdsFromAllTeams } from './removeIndividualParticipantIds';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { removeEventEntries } from '@Mutate/entries/removeEventEntries';
import { getParticipants } from '@Query/participants/getParticipants';
import { addEventEntries } from '@Mutate/entries/addEventEntries';
import { addNotice } from '@Global/state/globalState';
import { intersection } from '@Tools/arrays';

// constants and types
import { ARRAY, ERROR, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { GROUP, PAIR, TEAM as participantTeam } from '@Constants/participantConstants';
import { DELETE_PARTICIPANTS } from '@Constants/topicConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { DOUBLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';
import {
  CANNOT_REMOVE_PARTICIPANTS,
  MISSING_PARTICIPANT_IDS,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  ErrorType,
  MISSING_EVENT,
} from '@Constants/errorConditionConstants';

type DeleteParticipantsArgs = {
  addIndividualParticipantsToEvents?: boolean;
  tournamentRecord: Tournament;
  participantIds: string[];
};

export function deleteParticipants(params: DeleteParticipantsArgs): {
  participantsRemovedCount?: number;
  success?: boolean;
  error?: ErrorType;
} {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    { participantIds: true, [OF_TYPE]: ARRAY, [ERROR]: MISSING_PARTICIPANT_IDS },
  ]);
  if (paramsCheck.error) return paramsCheck;
  const { addIndividualParticipantsToEvents, tournamentRecord, participantIds } = params;

  const participantsCount = tournamentRecord.participants?.length || 0;
  if (!participantsCount) return { ...SUCCESS };

  const teamDrawIds = (tournamentRecord.events ?? [])
    ?.filter(({ eventType }) => eventType === TEAM)
    .map((event) => event?.drawDefinitions?.map(({ drawId }) => drawId))
    .flat(Infinity);

  // cannot use getParticipants() because event objects don't have drawIds array
  const tournamentParticipants =
    getParticipants({
      participantFilters: { participantIds },
      tournamentRecord,
      withDraws: true,
    }).participants ?? [];

  const getPlacedPairParticipantIds = (teamDrawIds) => {
    const matchUps =
      allTournamentMatchUps({
        matchUpFilters: { drawIds: teamDrawIds, matchUpTypes: [DOUBLES] },
        tournamentRecord,
      }).matchUps ?? [];

    const placedPairParticipantIds = matchUps
      .flatMap(({ sides }) => sides?.map(({ participantId }) => participantId ?? []))
      .filter(Boolean);

    return intersection(placedPairParticipantIds, participantIds);
  };

  // for team draws it is necessary to check matchUps for pair participantIds "discovered" in collectionAssignments
  const placedPairParticipantIds = teamDrawIds?.length ? getPlacedPairParticipantIds(teamDrawIds) : [];

  const participantsInDraws = tournamentParticipants.filter(
    (participant) =>
      participant.draws?.filter(
        (drawInfo) => (!teamDrawIds?.length || !teamDrawIds?.includes(drawInfo.drawId)) && drawInfo.positionAssignments,
      ).length,
  );

  if (placedPairParticipantIds?.length || participantsInDraws.length) {
    return { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT };
  }

  // Deleting an individual deletes every PAIR containing it, so those PAIRs must hold no drawPosition and
  // their entries go with them: the refusal and the entries removal both cover the derived PAIR ids.
  const derivedPairIds = (tournamentRecord.participants ?? [])
    .filter(
      (participant) => !participantIds.includes(participant.participantId) && isRemoved(participant, participantIds),
    )
    .map(({ participantId }) => participantId);
  const entryParticipantIds = [...participantIds, ...derivedPairIds];

  // Every refusal the writes below could make is asked here, before the first write.
  const refusal = entriesRemovalRefusal({ tournamentRecord, participantIds: entryParticipantIds });
  if (refusal) return refusal;
  if (!(tournamentRecord.participants ?? []).some((participant) => isRemoved(participant, participantIds))) {
    return { error: CANNOT_REMOVE_PARTICIPANTS };
  }

  const eventParticipantIdsRemoved = {};
  // what the notices announce: every participant removed (a PAIR goes with its deleted individual,
  // though only the individual was requested) and every grouping whose ids were pruned
  const removedParticipantIds: string[] = [];
  const prunedGroupings: Participant[] = [];
  const mappedIndividualParticipantIdsToAdd = {};

  // If not active in draws, remove the entries of every participant being deleted, derived PAIRs included
  for (const event of tournamentRecord.events ?? []) {
    const result = removeEventEntries({
      participantIds: entryParticipantIds,
      event,
    });
    if (result.error) return result;
    eventParticipantIdsRemoved[event.eventId] = result.participantIdsRemoved;
  }

  tournamentRecord.participants = (tournamentRecord.participants ?? []).filter((participant) => {
    const participantToRemove = isRemoved(participant, participantIds);

    // Remove deleted individuals from every grouping that referenced them — TEAM *and* GROUP.
    //
    // GROUP was missing, so a deleted participant stayed in every group they belonged to. Those dangling
    // ids are not inert: they reach draw avoidance (`addParticipantGroupings`), SHARED_GROUPING conflict
    // evaluation, `membersCount`, and the public participants payload. The sibling path
    // `removeParticipantIdsFromAllTeams` does not cover it either — its role filter defaults to
    // COMPETITOR, and a GROUP carries OTHER or a relationship role, so it skips them.
    //
    // `contactParticipantIds` is pruned alongside, or a grouping would keep pointing at a deleted
    // participant as its contact person.
    if (
      !participantToRemove &&
      participant.participantType &&
      [participantTeam, GROUP].includes(participant.participantType)
    ) {
      const prunesIndividuals = participant.individualParticipantIds?.some((id) => participantIds.includes(id));
      const prunesContacts = participant.contactParticipantIds?.some((id) => participantIds.includes(id));
      if (prunesIndividuals) {
        participant.individualParticipantIds = participant.individualParticipantIds?.filter(
          (id) => !participantIds.includes(id),
        );
      }
      if (prunesContacts) {
        participant.contactParticipantIds = participant.contactParticipantIds?.filter(
          (id) => !participantIds.includes(id),
        );
      }
      if (prunesIndividuals || prunesContacts) prunedGroupings.push(participant);
    }

    if (
      participantToRemove &&
      addIndividualParticipantsToEvents &&
      participant.participantType &&
      [PAIR, participantTeam].includes(participant.participantType)
    ) {
      for (const individualParticipantId of participant.individualParticipantIds ?? []) {
        if (!participantIds.includes(individualParticipantId)) {
          if (!mappedIndividualParticipantIdsToAdd[participant.participantId])
            mappedIndividualParticipantIdsToAdd[participant.participantId] = [];
          mappedIndividualParticipantIdsToAdd[participant.participantId].push(individualParticipantId);
        }
      }
    }
    if (participantToRemove) removedParticipantIds.push(participant.participantId);
    return !participantToRemove;
  });

  const participantsRemovedCount = participantsCount - tournamentRecord.participants.length;

  removeParticipantIdsFromAllTeams({
    individualParticipantIds: participantIds,
    tournamentRecord,
  });

  if (addIndividualParticipantsToEvents) {
    for (const event of tournamentRecord.events ?? []) {
      const groupParticipantIds = eventParticipantIdsRemoved[event.eventId];
      const individualParticipantIds = groupParticipantIds
        .map((participantId) => mappedIndividualParticipantIdsToAdd[participantId] ?? [])
        .flat();
      addEventEntries({
        participantIds: individualParticipantIds,
        entryStatus: UNGROUPED,
        tournamentRecord,
        event,
      });
    }
  }

  // participantsRemovedCount is never 0: the pre-check refused a call that would remove no participant
  addNotice({
    payload: { participantIds: removedParticipantIds, tournamentId: tournamentRecord.tournamentId },
    topic: DELETE_PARTICIPANTS,
  });
  modifyParticipantsNotice({ tournamentId: tournamentRecord.tournamentId, participants: prunedGroupings });

  return { ...SUCCESS, participantsRemovedCount };
}

// a requested participant, or a PAIR one of whose individuals is requested
function isRemoved(participant: Participant, participantIds: string[]): boolean {
  return (
    participantIds.includes(participant.participantId) ||
    (participant.participantType === PAIR &&
      !!participant.individualParticipantIds?.some((id) => participantIds.includes(id)))
  );
}

/**
 * The refusals `removeEventEntries` would make for each event, asked of EVERY event before any is written.
 *
 * The draw-assignment check above skips TEAM draws (an individual is "in" a TEAM draw through lineUps,
 * which must not block deleting them), so a TEAM participant positioned in a TEAM draw passed it. The
 * per-event loop then removed its entries from every earlier event before `removeEventEntries` refused
 * at the event holding the position. This asks the same question `removeEventEntries` asks — is any
 * requested participant assigned a drawPosition in any of the event's draws, TEAM draws included — of
 * all events at once.
 */
function entriesRemovalRefusal({
  tournamentRecord,
  participantIds,
}: {
  tournamentRecord: Tournament;
  participantIds: string[];
}): { error: ErrorType } | undefined {
  const events = tournamentRecord.events ?? [];
  if (events.some((event) => !event?.eventId)) return { error: MISSING_EVENT };

  const assigned = events.some((event) =>
    (event.drawDefinitions ?? []).some((drawDefinition) =>
      (getAssignedParticipantIds({ drawDefinition }).assignedParticipantIds ?? []).some((participantId) =>
        participantIds.includes(participantId),
      ),
    ),
  );
  return assigned ? { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } : undefined;
}
