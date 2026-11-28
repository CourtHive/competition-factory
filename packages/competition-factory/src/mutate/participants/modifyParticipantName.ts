import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';

// constants
import { MISSING_VALUE, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { Tournament } from '@Types/tournamentTypes';

type ModifyParticipantNameArgs = {
  tournamentRecord?: Tournament;
  participantName?: string;
  participantId?: string;
};
export function modifyParticipantName({ tournamentRecord, participantName, participantId }: ModifyParticipantNameArgs) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  if (!participantName) return { error: MISSING_VALUE, info: 'Missing participantName' };

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  } as Parameters<typeof findTournamentParticipant>[0]);
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  participant.participantName = participantName;

  // announced (and so factory-stamped) whether or not anything subscribes: gated on the subscription, the stored
  // record depended on who was listening
  modifyParticipantsNotice({
    tournamentId: tournamentRecord!.tournamentId,
    participants: [participant],
  });

  return { ...SUCCESS };
}
