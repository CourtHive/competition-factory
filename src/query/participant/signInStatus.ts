import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { latestPresenceState } from '@Acquire/presenceAttestations';
import { requireParams } from '@Helpers/parameters/requireParams';

// constants
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SIGNED_IN } from '@Constants/participantConstants';

export function getParticipantSignInStatus({ tournamentRecord, participantId }) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });

  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  // The LATEST recorded state. See `getParticipantSignedInOnDate` for "was this person here on <date>",
  // which this cannot answer because no sign-out is recorded at the end of a day.
  const state = latestPresenceState(participant);

  // Tri-state, and deliberately so: `undefined` means NOTHING was ever recorded, `false` means a
  // departure WAS recorded. Collapsing them would report a person nobody has ever seen identically to
  // one who signed out and went home — the "an inference shown as a record" trap, in miniature.
  if (state === undefined) return undefined;

  return state === SIGNED_IN && SIGNED_IN;
}
