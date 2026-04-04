import { requireParams } from '@Helpers/parameters/requireParams';
import { overlap } from '@Tools/arrays';

// constants and types
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { PAIR, TEAM } from '@Constants/participantConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

/**
 * Returns { eventDetails: { eventName, eventId }} for events in which participantId or TEAM/PAIR including participantId appears
 */

type getParticipantEventDetailsType = {
  tournamentRecord: Tournament;
  participantId: string;
};

export function getParticipantEventDetails({
  tournamentRecord,
  participantId,
}: getParticipantEventDetailsType): ResultType & {
  eventDetails?: { eventName?: string; eventId: string }[];
} {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  // relveantParticipantIds is the target participantId along with any TEAM or PAIR participantIds to which participantId belongs
  const relevantParticipantIds = [participantId].concat(
    (tournamentRecord.participants ?? [])
      .filter(
        (participant) =>
          participant?.participantType &&
          [TEAM, PAIR].includes(participant.participantType) &&
          participant.individualParticipantIds?.includes(participantId),
      )
      .map((participant) => participant.participantId),
  );

  const relevantEvents = (tournamentRecord.events ?? [])
    .filter((event) => {
      const enteredParticipantIds = (event?.entries ?? []).map((entry) => entry.participantId);
      return overlap(enteredParticipantIds, relevantParticipantIds);
    })
    .map((event) => ({ eventName: event.eventName, eventId: event.eventId }));

  return { eventDetails: relevantEvents };
}
