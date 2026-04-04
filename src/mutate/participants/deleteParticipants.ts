import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { removeParticipantIdsFromAllTeams } from './removeIndividualParticipantIds';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';
import { removeEventEntries } from '../entries/removeEventEntries';
import { addEventEntries } from '../entries/addEventEntries';
import { addNotice } from '@Global/state/globalState';
import { intersection } from '@Tools/arrays';

// Constants
import { ARRAY, ERROR, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { PAIR, TEAM as participantTeam } from '@Constants/participantConstants';
import { DELETE_PARTICIPANTS } from '@Constants/topicConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { DOUBLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';
import {
  CANNOT_REMOVE_PARTICIPANTS,
  MISSING_PARTICIPANT_IDS,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  ErrorType,
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

  const eventParticipantIdsRemoved = {};
  const mappedIndividualParticipantIdsToAdd = {};

  // If not active in draws, remove participantIds from all entries
  for (const event of tournamentRecord.events ?? []) {
    const result = removeEventEntries({
      participantIds,
      event,
    });
    if (result.error) return result;
    eventParticipantIdsRemoved[event.eventId] = result.participantIdsRemoved;
  }

  tournamentRecord.participants = (tournamentRecord.participants ?? []).filter((participant) => {
    const participantToRemove =
      participantIds.includes(participant.participantId) ||
      (participant.participantType === PAIR &&
        participant.individualParticipantIds?.some((id) => participantIds.includes(id)));

    // remove deleted individualParticipantIds from TEAMs
    if (
      !participantToRemove &&
      participant.participantType === TEAM &&
      participant.individualParticipantIds?.some((id) => participantIds.includes(id))
    ) {
      participant.individualParticipantIds = participant.individualParticipantIds.filter(
        (id) => !participantIds.includes(id),
      );
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

  if (participantsRemovedCount) {
    addNotice({
      payload: { participantIds, tournamentId: tournamentRecord.tournamentId },
      topic: DELETE_PARTICIPANTS,
    });
  }

  return participantsRemovedCount ? { ...SUCCESS, participantsRemovedCount } : { error: CANNOT_REMOVE_PARTICIPANTS };
}
