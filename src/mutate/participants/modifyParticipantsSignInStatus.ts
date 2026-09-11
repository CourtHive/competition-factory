import { addParticipantTimeItem } from '../timeItems/addTimeItem';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTopics } from '@Global/state/globalState';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { getParticipantId } from '@Functions/global/extractors';

import { INVALID_VALUES, MISSING_PARTICIPANTS, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SIGNED_IN, SIGNED_OUT, SIGN_IN_STATUS } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * `occurredAt` — ISO string recording when the sign-in actually HAPPENED, as
 * opposed to when this instance wrote it. Defaults to now, so existing callers
 * are unaffected.
 *
 * Sign-in status is stored as a timeItem, and timeItem `createdAt` is the
 * ordering key the query layer uses to resolve the CURRENT status. An edit made
 * at a venue and synced later must therefore carry its own time, or it both
 * misreports when the player signed in and sorts as though it happened at sync
 * time. See `Mentat/planning/DISCONNECTED_SYNC_RECONCILIATION.md` §4.1.
 */
export function modifyParticipantsSignInStatus({ tournamentRecord, participantIds, signInState, occurredAt }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!Array.isArray(participantIds)) return { error: MISSING_VALUE };

  const validSignInState = [SIGNED_IN, SIGNED_OUT].includes(signInState);
  if (!validSignInState) return { error: INVALID_VALUES, signInState };

  const participants = tournamentRecord.participants ?? [];
  if (!participants.length) return { error: MISSING_PARTICIPANTS };

  const allParticipantIds = new Set(participants.map(getParticipantId));
  const invalidParticipantIds = participantIds.filter((participantId) => !allParticipantIds.has(participantId));
  if (invalidParticipantIds.length) return { error: INVALID_VALUES, context: { invalidParticipantIds } };

  const modifiedParticipants: Participant[] = [];
  const createdAt = occurredAt ?? new Date().toISOString();
  for (const participant of participants) {
    const { participantId } = participant;
    if (participantIds.includes(participantId)) {
      const timeItem = {
        itemType: SIGN_IN_STATUS,
        itemValue: signInState,
        createdAt,
      };
      const result = addParticipantTimeItem({
        duplicateValues: false,
        disableNotice: true, // this fn batch-dispatches MODIFY_PARTICIPANTS below
        tournamentRecord,
        participantId,
        timeItem,
      });
      if (result.error) return result;
      modifiedParticipants.push(participant);
    }
  }

  const { topics } = getTopics();
  if (modifiedParticipants.length && topics.includes(MODIFY_PARTICIPANTS)) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: modifiedParticipants,
    });
  }

  return { ...SUCCESS };
}
