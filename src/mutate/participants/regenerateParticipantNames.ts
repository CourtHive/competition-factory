import { formatParticipantName } from '@Assemblies/generators/participants/formatParticipantName';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { createMap, isObject } from '@Tools/objects';

import { MISSING_TOURNAMENT_RECORD, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * "First Last"
 * "Last, First"
 * "LAST, First"
 * "LAST, FIRST"
 * "F. Last"
 * "first last"
 * "Last"
 */

type RegenArgs = {
  formats: { [key: string]: { personFormat: string; doublesJoiner: string } }[];
  tournamentRecord: Tournament;
};

export function regenerateParticipantNames({ tournamentRecord, formats }: RegenArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!isObject(formats)) return { error: MISSING_VALUE };

  const participants = tournamentRecord.participants ?? [];

  const participantMap = createMap(participants, 'participantId');

  for (const participant of participants) {
    formatParticipantName({ participant, participantMap, formats });
  }

  // every participantName may have been rewritten → dispatch MODIFY_PARTICIPANTS
  if (participants.length) {
    modifyParticipantsNotice({ tournamentId: tournamentRecord.tournamentId, participants });
  }

  return { ...SUCCESS };
}
