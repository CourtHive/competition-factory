import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { resolveFromParameters } from '@Helpers/parameters/resolveFromParameters';
import { checkOutParticipant } from './checkOutParticipant';
import { checkInParticipant } from './checkInParticipant';

// constants and types
import { MATCHUP_NOT_FOUND, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import type { Attribution } from '@Types/presenceTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import {
  DRAW_DEFINITION,
  ERROR,
  IN_CONTEXT,
  MATCHUP,
  MATCHUP_ID,
  PARAM,
  PARTICIPANT_ID,
} from '@Constants/attributeConstants';

type ToggleParticipantCheckInStateArgs = {
  attributedTo?: Attribution;
  attestationId?: string;
  occurredAt?: string;
  notes?: string;
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  activeTournamentId?: string;
  participantId: string;
  tournamentId?: string;
  matchUpIds?: string[];
  matchUpId: string;
};

export function toggleParticipantCheckInState(params: ToggleParticipantCheckInStateArgs) {
  const paramCheck = checkRequiredParameters(params, [
    { [PARTICIPANT_ID]: true, [DRAW_DEFINITION]: true, [MATCHUP_ID]: true },
  ]);
  if (paramCheck.error) return paramCheck;

  const tournamentId = params.tournamentId ?? params.activeTournamentId;
  const tournamentRecord = params.tournamentRecord ?? (tournamentId && params.tournamentRecords?.[tournamentId]);

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const resolutions = resolveFromParameters(params, [
    { [PARAM]: MATCHUP, attr: { [IN_CONTEXT]: true }, [ERROR]: MATCHUP_NOT_FOUND },
  ]);
  const matchUp = resolutions.matchUp?.matchUp;
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const { checkedInParticipantIds = [] } = getCheckedInParticipantIds({
    matchUp,
  });

  const { participantId, matchUpId, drawDefinition, attributedTo, occurredAt, attestationId, notes } = params;

  // The attestation fields are FORWARDED, not re-derived. This is the entry point every desk client
  // uses — it is the one that decides which direction the toggle is going — so dropping them here
  // meant an attester could be supplied, accepted, and silently discarded on the only path that is
  // actually called. A check-out is an attested fact too: somebody vouched that the player left.
  const attestation = { attributedTo, occurredAt, attestationId, notes };

  if (participantId && checkedInParticipantIds.includes(participantId)) {
    return checkOutParticipant({
      ...attestation,
      tournamentRecord,
      drawDefinition,
      participantId,
      matchUpId,
      matchUp,
    });
  } else {
    return checkInParticipant({
      ...attestation,
      tournamentRecord,
      drawDefinition,
      participantId,
      matchUpId,
      matchUp,
    });
  }
}
