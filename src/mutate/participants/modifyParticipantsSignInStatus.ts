import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { addParticipantPresenceAttestation } from '@Mutate/timeItems/addTimeItem';
import { validatePresenceAttribution } from '@Query/participant/presencePolicy';
import { buildAttestation } from '@Mutate/presence/buildAttestation';
import { latestPresenceState } from '@Acquire/presenceAttestations';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { getTopics } from '@Global/state/globalState';

// constants and types
import {
  INVALID_ATTRIBUTION,
  INVALID_VALUES,
  MISSING_PARTICIPANTS,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';
import { SIGNED_IN, SIGNED_OUT } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import type { Attribution } from '@Types/presenceTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Participant } from '@Types/tournamentTypes';

/**
 * Record arrival at — or departure from — the TOURNAMENT. Distinct from per-matchUp check-in, which is
 * one matchUp and lives on the matchUp (D4a: never both on one operator control).
 *
 * CODES first-class as of 7.0.0: writes a `PresenceAttestation` to `participant.presence` rather than a
 * `SIGN_IN_STATUS` timeItem.
 *
 * `occurredAt` — ISO string recording when the sign-in actually HAPPENED, as opposed to when this
 * instance wrote it. Defaults to now, so existing callers are unaffected. Before the promotion this
 * parameter had to OVERWRITE the timeItem's `createdAt`, which was simultaneously the value's timestamp
 * and the ordering key; `occurredAt` and `recordedAt` are now separate fields and only the first
 * resolves presence. See `Mentat/planning/DISCONNECTED_SYNC_RECONCILIATION.md` §4.1.
 *
 * `attributedTo` — who attested it. A desk operator, or a declared name and number for somebody not in
 * the record at all. ⚠️ Refused under `schemaWriteMode: 'legacy'`, which has nowhere to put it.
 */
export function modifyParticipantsSignInStatus({
  tournamentRecord,
  participantIds,
  attributedTo,
  signInState,
  occurredAt,
  notes,
}: {
  tournamentRecord: any;
  participantIds: string[];
  attributedTo?: Attribution;
  signInState: string;
  occurredAt?: string;
  notes?: string;
}) {
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
  // One instant for the whole batch: a bulk sign-in is a single operator action, and letting each
  // entry take its own clock reading would order them arbitrarily within the same second.
  const batchOccurredAt = occurredAt ?? new Date().toISOString();

  for (const participant of participants) {
    const { participantId } = participant;
    if (!participantIds.includes(participantId)) continue;

    // Signing in when already signed in is not a new fact, and recording it as one would fill the log
    // with entries that change nothing while making "how many times did they present?" unanswerable.
    // Preserves the pre-promotion `duplicateValues: false` semantics, which suppressed a write whose
    // value equalled the latest. The matchUp check-in path has its own equivalent guard.
    if (latestPresenceState(participant) === signInState) {
      modifiedParticipants.push(participant);
      continue;
    }

    // ⚠️ No `category` is passed, and it is not an omission. Sign-in is TOURNAMENT-wide: a participant
    // may be entered in several events with different categories, so there is no single category whose
    // allowance would apply. `byCategory` is therefore meaningful for `matchCheckIn` only, where the
    // matchUp names exactly one event. A federation wanting a junior-specific sign-in rule should scope
    // it by ROLE, or attach the policy to the event.
    //
    // `expectation` is not consulted; only `onInvalid: 'reject'` blocks. See checkInParticipant.
    const attribution = validatePresenceAttribution({
      fact: 'signIn',
      tournamentRecord,
      attributedTo,
      participant,
    });
    if (!attribution.valid && attribution.onInvalid === 'reject') {
      return { error: INVALID_ATTRIBUTION, context: { participantId, reason: attribution.reason } };
    }

    const result = addParticipantPresenceAttestation({
      attestation: buildAttestation({
        occurredAt: batchOccurredAt,
        state: signInState as any,
        participantId,
        attributedTo,
        notes,
      }),
      disableNotice: true, // this fn batch-dispatches MODIFY_PARTICIPANTS below
      tournamentRecord,
      participantId,
    });
    if (result.error) return result;
    modifiedParticipants.push(participant);
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
