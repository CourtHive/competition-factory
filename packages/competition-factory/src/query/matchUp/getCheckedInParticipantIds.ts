import { getMatchUpParticipantIds } from './getMatchUpParticipantIds';
import { getMatchUpPresence } from '@Acquire/presenceAttestations';

// constants and types
import { INVALID_MATCHUP, MISSING_CONTEXT, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { CHECKED_IN } from '@Constants/presenceConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

/*
  takes a matchUpWithContext
  returns all participantIds which have current checkedIn status
    - if sideParticipant is participantType TEAM or PAIR then
      sideParticipant is considered checkedIn if all individualParticipants are checkedIn
    - if sideParticipant is participantType TEAM or PAIR and is checkedIn then
      all individualParticipants are considered checkedIn

  The side-level INFERENCE above is unchanged by the CODES promotion and is deliberately kept. Only the
  WRITE subject was restricted to INDIVIDUAL participants — reading still answers "is this side at the
  desk", which is what every consuming surface asks.
*/
export function getCheckedInParticipantIds({ matchUp }: { matchUp: HydratedMatchUp }): ResultType & {
  allRelevantParticipantIds?: string[];
  allParticipantsCheckedIn?: boolean;
  checkedInParticipantIds?: string[];
} {
  if (!matchUp) return { error: MISSING_MATCHUP };
  if (!matchUp.hasContext) return { error: MISSING_CONTEXT };

  if (!matchUp.sides || matchUp?.sides.filter(Boolean).length !== 2) {
    return { error: INVALID_MATCHUP };
  }

  const { nestedIndividualParticipantIds, allRelevantParticipantIds, sideParticipantIds } = getMatchUpParticipantIds({
    matchUp,
  });

  // Ordered oldest-first, from `matchUp.checkIns` when the record has been promoted and from the legacy
  // CHECK_IN / CHECK_OUT timeItems when it has not. One fold, either surface.
  const attestations = getMatchUpPresence(matchUp);

  // Last recorded state wins, per subject. `attestations` is already ordered by `occurredAt`.
  const latestByParticipant = new Map<string, string>();
  for (const attestation of attestations) {
    if (attestation?.participantId) latestByParticipant.set(attestation.participantId, attestation.state);
  }

  const checkedInParticipantIds = [...latestByParticipant.entries()]
    .filter(([, state]) => state === CHECKED_IN)
    .map(([participantId]) => participantId);

  // if all individuals on one side are checked in then side is checked in
  nestedIndividualParticipantIds?.forEach((sideIndividualParticipantIds, sideIndex) => {
    const sideParticipantId = sideParticipantIds?.[sideIndex];
    const allIndividualsCheckedIn =
      sideIndividualParticipantIds?.length &&
      sideIndividualParticipantIds.every((participantId) => checkedInParticipantIds.includes(participantId));

    if (sideParticipantId && allIndividualsCheckedIn && !checkedInParticipantIds.includes(sideParticipantId)) {
      checkedInParticipantIds.push(sideParticipantId);
    }
  });

  // if side is checked in then all individuals on that side are checked in
  sideParticipantIds?.forEach((sideParticipantId: string, sideIndex) => {
    if (checkedInParticipantIds.includes(sideParticipantId)) {
      (nestedIndividualParticipantIds?.[sideIndex] ?? []).forEach((participantId) => {
        if (participantId && !checkedInParticipantIds.includes(participantId)) {
          checkedInParticipantIds.push(participantId);
        }
      });
    }
  });

  const allParticipantsCheckedIn = sideParticipantIds?.reduce((checkedIn, participantId) => {
    return checkedInParticipantIds.includes(participantId) && checkedIn;
  }, true);

  return {
    allRelevantParticipantIds,
    allParticipantsCheckedIn,
    checkedInParticipantIds,
    ...SUCCESS,
  };
}
