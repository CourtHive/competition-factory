import { addMatchUpPresenceAttestation } from '@Mutate/timeItems/matchUps/matchUpTimeItems';
import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getMatchUpParticipantIds } from '@Query/matchUp/getMatchUpParticipantIds';
import { resolveFromParameters } from '@Helpers/parameters/resolveFromParameters';
import { validatePresenceAttribution } from '@Query/participant/presencePolicy';
import { buildAttestation } from '@Mutate/presence/buildAttestation';

// constants and types
import {
  INVALID_ATTESTATION_SUBJECT,
  INVALID_ATTRIBUTION,
  INVALID_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';
import { CheckInOutParticipantArgs } from '@Types/factoryTypes';
import { CHECKED_IN } from '@Constants/presenceConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION,
  ERROR,
  IN_CONTEXT,
  MATCHUP,
  MATCHUP_ID,
  PARAM,
  PARTICIPANT_ID,
  TOURNAMENT_RECORD,
} from '@Constants/attributeConstants';

/**
 * Record that a participant has presented themselves at the desk for THIS matchUp.
 *
 * CODES first-class as of 7.0.0: writes a `PresenceAttestation` to `matchUp.checkIns` rather than a
 * `CHECK_IN` timeItem, carrying `occurredAt` (when it happened), `recordedAt` (when it was written) and
 * an optional `attributedTo` naming who attested it — a participant, or a declared name and number for
 * somebody not in the record at all, such as a minor's parent.
 *
 * **The subject must be an INDIVIDUAL.** The pre-7.0.0 API also accepted the PAIR or TEAM on a side and
 * reconciled it with nothing, so a desk that checked in the pair and a desk that checked in both
 * players stored different state for one physical fact. Side-level presence is still DERIVED on read
 * by `getCheckedInParticipantIds`, in both directions, exactly as before.
 */
export function checkInParticipant(params: CheckInOutParticipantArgs) {
  const requiredParams = [
    { [TOURNAMENT_RECORD]: true },
    { [DRAW_DEFINITION]: true },
    { [PARTICIPANT_ID]: true },
    { [MATCHUP_ID]: true },
  ];
  const paramCheck = checkRequiredParameters(params, requiredParams);
  if (paramCheck[ERROR]) return paramCheck;

  const resolutions = resolveFromParameters(params, [{ [PARAM]: MATCHUP, attr: { [IN_CONTEXT]: true } }]);
  if (resolutions[ERROR]) return resolutions;

  const { tournamentRecord, drawDefinition, participantId, matchUpId, attributedTo, occurredAt, attestationId, notes } =
    params;

  const matchUp = resolutions?.matchUp?.matchUp;

  const result = getCheckedInParticipantIds({ matchUp });
  if (result?.error) return result;

  const { checkedInParticipantIds, allRelevantParticipantIds } = result ?? {};
  if (!allRelevantParticipantIds?.includes(participantId)) return { [ERROR]: INVALID_PARTICIPANT_ID };

  const { individualParticipantIds } = getMatchUpParticipantIds({ matchUp });
  if (!individualParticipantIds?.includes(participantId)) {
    return { [ERROR]: INVALID_ATTESTATION_SUBJECT, context: { participantId } };
  }

  const confirmation = { ...SUCCESS, checkedIn: true };
  if (checkedInParticipantIds?.includes(participantId)) return confirmation;

  // The sanctioning policy's attribution rule, including any category allowance — a U10 event
  // routinely permits a PARENT where the tournament otherwise requires SELF.
  //
  // ⚠️ `expectation: 'required'` is NOT consulted here, deliberately. It is a policy value, not an
  // instruction, and D4d's finding is that a hard block teaches operators to check everybody in at
  // 9am so the software stops arguing — which destroys the signal check-in exists to produce.
  // `onInvalid: 'reject'` is the one value that blocks, and it blocks on WHO ATTESTED, not on whether
  // presence was expected.
  const attribution = validatePresenceAttribution({
    event: matchUp?.event ?? params.event,
    participant: matchUp?.sides
      ?.flatMap((side: any) => side?.participant?.individualParticipants ?? [side?.participant])
      .find((candidate: any) => candidate?.participantId === participantId),
    fact: 'matchCheckIn',
    tournamentRecord,
    drawDefinition,
    attributedTo,
  });
  if (!attribution.valid && attribution.onInvalid === 'reject') {
    return { [ERROR]: INVALID_ATTRIBUTION, context: { reason: attribution.reason } };
  }

  const appendResult = addMatchUpPresenceAttestation({
    attestation: buildAttestation({
      state: CHECKED_IN,
      attestationId,
      participantId,
      attributedTo,
      occurredAt,
      notes,
    }),
    tournamentRecord,
    drawDefinition,
    matchUpId,
  });
  if (appendResult.error) return appendResult;

  return confirmation;
}
