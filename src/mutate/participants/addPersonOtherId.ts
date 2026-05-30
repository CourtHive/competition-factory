import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice, getTopics } from '@Global/state/globalState';

import { INVALID_VALUES, MISSING_VALUE, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Upsert a `UnifiedPersonID` entry into the participant's
 * `person.personOtherIds[]` array.
 *
 * `organisationId` is treated as the upsert key: if the participant
 * already has an entry with the given `organisationId`, that entry's
 * `personId` is replaced. Otherwise a new entry is appended with a
 * `createdAt` timestamp.
 *
 * Idempotent: re-applying the same `(organisationId, personId)` is a
 * no-op (array length unchanged, no notice topic side effect).
 *
 * Factory is deliberately neutral on what `organisationId` represents
 * — federation member IDs, canonical-registry IDs from a downstream
 * service, anything the caller chooses. The factory neither validates
 * the value nor knows what produced it.
 *
 * Only valid on INDIVIDUAL participants (the ones with a `person`
 * object). Non-INDIVIDUAL types (TEAM / PAIR / GROUP) return
 * `INVALID_VALUES`.
 */
export function addPersonOtherId({
  tournamentRecord,
  participantId,
  organisationId,
  personId,
}: {
  tournamentRecord: any;
  participantId: string;
  organisationId: string;
  personId: string;
}) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  if (!organisationId) return { error: MISSING_VALUE, info: 'Missing organisationId' };
  if (!personId) return { error: MISSING_VALUE, info: 'Missing personId' };

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };
  if (!participant.person)
    return {
      error: INVALID_VALUES,
      info: 'Participant has no person — only INDIVIDUAL participants accept personOtherIds',
    };

  const person = participant.person;
  person.personOtherIds ??= [];

  const existing = person.personOtherIds.find((entry: any) => entry?.organisationId === organisationId);

  if (existing) {
    if (existing.personId === personId) {
      // Idempotent no-op: same (organisationId, personId) already stamped.
      return { ...SUCCESS };
    }
    existing.personId = personId;
    existing.updatedAt = new Date().toISOString();
  } else {
    person.personOtherIds.push({
      organisationId,
      personId,
      createdAt: new Date().toISOString(),
    });
  }

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: [participant],
      },
    });
  }

  return { ...SUCCESS };
}
