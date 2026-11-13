import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { nowIso } from '@Tools/clock';

// constants
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_VALUES,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
  EXISTING_PERSON_OTHER_ID,
} from '@Constants/errorConditionConstants';

/**
 * Upsert a `UnifiedPersonID` entry into the participant's
 * `person.personOtherIds[]` array.
 *
 * `organisationId` is the key. With no entry for it, a new entry is
 * appended with a `createdAt` timestamp. An existing entry with a
 * different `personId` is replaced only when `replaceExisting` is set
 * (any duplicate entries for that organisation are collapsed into the
 * one kept); otherwise the call refuses with EXISTING_PERSON_OTHER_ID.
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
  occurredAt,
  replaceExisting,
}: {
  tournamentRecord: any;
  participantId: string;
  organisationId: string;
  personId: string;
  /**
   * Required to re-point an organisation's existing, different id. Without it the call refuses with
   * EXISTING_PERSON_OTHER_ID, so re-pointing an identity is always an explicit decision by the caller.
   */
  replaceExisting?: boolean;
  /**
   * ISO string recording when the id was actually assigned, rather than when
   * this instance wrote it. Defaults to now.
   */
  occurredAt?: string;
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

  const existing = person.personOtherIds.filter((entry) => entry?.organisationId === organisationId);

  if (existing.length) {
    // Idempotent no-op: same (organisationId, personId) already stamped.
    if (existing.every((entry) => entry.personId === personId)) return { ...SUCCESS };
    if (!replaceExisting) {
      return {
        error: EXISTING_PERSON_OTHER_ID,
        context: { organisationId, existingPersonIds: existing.map((entry) => entry.personId) },
      };
    }
    const [kept] = existing;
    kept.personId = personId;
    kept.updatedAt = occurredAt ?? nowIso();
    person.personOtherIds = person.personOtherIds.filter(
      (entry) => entry === kept || entry?.organisationId !== organisationId,
    );
  } else {
    person.personOtherIds.push({
      organisationId,
      personId,
      createdAt: occurredAt ?? nowIso(),
    });
  }

  // announced (and so factory-stamped) whether or not anything subscribes: gated on the subscription, the stored
  // record depended on who was listening
  modifyParticipantsNotice({
    tournamentId: tournamentRecord.tournamentId,
    participants: [participant],
  });

  return { ...SUCCESS };
}
