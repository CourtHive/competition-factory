import { addMatchUpPresenceAttestation } from '@Mutate/timeItems/matchUps/matchUpTimeItems';
import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getMatchUpParticipantIds } from '@Query/matchUp/getMatchUpParticipantIds';
import { resolveFromParameters } from '@Helpers/parameters/resolveFromParameters';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { buildAttestation } from '@Mutate/presence/buildAttestation';

// constants and types
import {
  INVALID_ACTION,
  INVALID_ATTESTATION_SUBJECT,
  INVALID_PARTICIPANT_ID,
  PARTICIPANT_NOT_CHECKED_IN,
} from '@Constants/errorConditionConstants';
import { activeMatchUpStatuses, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { CheckInOutParticipantArgs } from '@Types/factoryTypes';
import { CHECKED_OUT } from '@Constants/presenceConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION,
  IN_CONTEXT,
  MATCHUP,
  MATCHUP_ID,
  PARAM,
  PARTICIPANT_ID,
  TOURNAMENT_RECORD,
} from '@Constants/attributeConstants';

/**
 * Reverse a check-in for THIS matchUp.
 *
 * CODES first-class as of 7.0.0 — see {@link checkInParticipant}. The subject must be an INDIVIDUAL.
 *
 * **The side-cascade is gone, and its absence is the point.** Before 7.0.0 a PAIR could be the subject,
 * and checking it out wrote a CHECK_OUT for the side *and* one per member — three stored facts for one
 * action, reconciled by nothing. With only individuals writable there is one fact per person, and
 * `getCheckedInParticipantIds` still derives the side's state from its members.
 */
export function checkOutParticipant(params: CheckInOutParticipantArgs) {
  const requiredParams = [
    { [TOURNAMENT_RECORD]: true },
    { [DRAW_DEFINITION]: true },
    { [PARTICIPANT_ID]: true },
    { [MATCHUP_ID]: true },
  ];
  const paramCheck = checkRequiredParameters(params, requiredParams);
  if (paramCheck.error) return paramCheck;

  const resolutions = resolveFromParameters(params, [{ [PARAM]: MATCHUP, attr: { [IN_CONTEXT]: true } }]);
  if (resolutions.error) return resolutions;

  const { tournamentRecord, drawDefinition, participantId, matchUpId, attributedTo, occurredAt, attestationId, notes } =
    params;

  const matchUp = resolutions?.matchUp?.matchUp;
  const { matchUpStatus, score } = matchUp ?? {};

  if (
    (matchUpStatus && activeMatchUpStatuses.includes(matchUpStatus)) ||
    (matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus)) ||
    checkScoreHasValue({ score })
  ) {
    return { error: INVALID_ACTION };
  }

  const getCheckedResult = getCheckedInParticipantIds({ matchUp });
  if (getCheckedResult?.error) return getCheckedResult;

  const { checkedInParticipantIds, allRelevantParticipantIds } = getCheckedResult ?? {};

  if (!allRelevantParticipantIds?.includes(participantId)) {
    return { error: INVALID_PARTICIPANT_ID };
  }

  const { individualParticipantIds } = getMatchUpParticipantIds({ matchUp });
  if (!individualParticipantIds?.includes(participantId)) {
    return { error: INVALID_ATTESTATION_SUBJECT, context: { participantId } };
  }

  if (!checkedInParticipantIds?.includes(participantId)) {
    return { error: PARTICIPANT_NOT_CHECKED_IN };
  }

  const appendResult = addMatchUpPresenceAttestation({
    attestation: buildAttestation({
      state: CHECKED_OUT,
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

  return { ...SUCCESS, checkedOut: true };
}
