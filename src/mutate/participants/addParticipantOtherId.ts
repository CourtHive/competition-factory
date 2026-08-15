import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTopics } from '@Global/state/globalState';

import { MISSING_VALUE, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Upsert a `UnifiedParticipantID` entry into the participant's
 * `participantOtherIds[]` array — the participant-grain sibling of
 * {@link addPersonOtherId}.
 *
 * `organisationId` is the upsert key: an existing entry for that organisation has its
 * `participantId` replaced; otherwise a new entry is appended with a `createdAt`
 * timestamp. Idempotent — re-applying the same `(organisationId, participantId)` is a
 * no-op.
 *
 * **Works on EVERY participantType.** This is the whole reason it exists alongside
 * `addPersonOtherId`, which can only serve INDIVIDUAL participants because it writes to
 * `participant.person` and a PAIR or TEAM has no `person` at all — its own error text says
 * so. A pair or team registered with an outside body previously had nowhere to record
 * that body's id for it, which made results unaddressable back to the registering system.
 *
 * As with `addPersonOtherId`, the factory is deliberately neutral about what
 * `organisationId` denotes and never validates the foreign id.
 */
export function addParticipantOtherId({
  tournamentRecord,
  organisationId,
  participantId,
  otherParticipantId,
  uniqueOrganisationName,
}: {
  tournamentRecord: any;
  organisationId: string;
  participantId: string;
  // the OTHER organisation's id for this participant. Named distinctly from
  // `participantId` because both are participant ids and silently swapping them would
  // stamp a participant with its own id and look like it worked.
  otherParticipantId: string;
  uniqueOrganisationName?: string;
}) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  if (!organisationId) return { error: MISSING_VALUE, info: 'Missing organisationId' };
  if (!otherParticipantId) return { error: MISSING_VALUE, info: 'Missing otherParticipantId' };

  const { participant } = findTournamentParticipant({ tournamentRecord, participantId });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  participant.participantOtherIds ??= [];

  const existing = participant.participantOtherIds.find((entry: any) => entry?.organisationId === organisationId);

  if (existing) {
    if (existing.participantId === otherParticipantId) return { ...SUCCESS }; // idempotent no-op
    existing.participantId = otherParticipantId;
    if (uniqueOrganisationName) existing.uniqueOrganisationName = uniqueOrganisationName;
    existing.updatedAt = new Date().toISOString();
  } else {
    participant.participantOtherIds.push({
      organisationId,
      participantId: otherParticipantId,
      ...(uniqueOrganisationName ? { uniqueOrganisationName } : {}),
      createdAt: new Date().toISOString(),
    });
  }

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: [participant],
    });
  }

  return { ...SUCCESS };
}
