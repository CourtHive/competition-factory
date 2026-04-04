import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipants } from './getParticipants';

// constants and types
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { GROUP, PAIR, TEAM } from '@Constants/participantConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

// Returns all grouping participants which include individual participantId

type GetMembershipArgs = {
  tournamentRecord: Tournament;
  participantId: string;
};

export function getParticipantMembership({
  tournamentRecord,
  participantId,
}: GetMembershipArgs): ResultType | { [key: string]: string[] } {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { participants } = getParticipants({
    participantFilters: { participantTypes: [TEAM, PAIR, GROUP] },
    tournamentRecord,
  });

  const memberOf = (participants ?? []).filter((participant) => {
    return participant.individualParticipantIds?.includes(participantId);
  });

  return memberOf.reduce((groupingTypesMap, participant) => {
    const participantType = participant.participantType;
    if (participantType) {
      if (!groupingTypesMap[participantType]) groupingTypesMap[participantType] = [];

      groupingTypesMap[participantType].push(participant);
    }
    return groupingTypesMap;
  }, {});
}
