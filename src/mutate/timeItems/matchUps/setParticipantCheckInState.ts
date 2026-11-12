import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { resolveFromParameters } from '@Acquire/resolveFromParameters';
import { checkOutParticipant } from './checkOutParticipant';
import { checkInParticipant } from './checkInParticipant';

// constants and types
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import type { Attribution } from '@Types/presenceTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_NOT_CHECKED_IN,
} from '@Constants/errorConditionConstants';
import {
  DRAW_DEFINITION,
  ERROR,
  IN_CONTEXT,
  MATCHUP,
  MATCHUP_ID,
  PARAM,
  PARTICIPANT_ID,
} from '@Constants/attributeConstants';

type SetParticipantCheckInStateArgs = {
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
  checkedIn: boolean;
  matchUpId: string;
};

/**
 * Bring a participant's presence for THIS matchUp to the requested state: an explicit intention, where
 * {@link toggleParticipantCheckInState} only flips whatever state the record holds.
 *
 * Two desks that both see a player absent and both press "check in" must leave the player checked in
 * with ONE attestation. The toggle cannot promise that — the second flip undoes the first — and the
 * strict {@link checkOutParticipant} refuses a redundant check-out. Both legacy methods are unchanged.
 *
 * A request for the state already held is a success with `changed: false` and writes nothing: a
 * redundant intention is not a new physical fact, so the first attester stands. Validation still runs on
 * a no-op — the subject must be an individual in this matchUp, and a check-out is refused once play or
 * scoring has begun, whether or not the player is already out. Attribution is validated only on an
 * actual transition, exactly as {@link checkInParticipant} does.
 *
 * `changed` is the contract a server relies on to decide what other copies of the record must apply: a
 * `changed: false` result holds no fact for anybody to replay.
 */
export function setParticipantCheckInState(params: SetParticipantCheckInStateArgs) {
  const paramCheck = checkRequiredParameters(params, [
    { [PARTICIPANT_ID]: true, [DRAW_DEFINITION]: true, [MATCHUP_ID]: true },
  ]);
  if (paramCheck.error) return paramCheck;

  const { checkedIn } = params;
  if (typeof checkedIn !== 'boolean') return { error: INVALID_VALUES, context: { checkedIn } };

  const tournamentId = params.tournamentId ?? params.activeTournamentId;
  const tournamentRecord = params.tournamentRecord ?? (tournamentId && params.tournamentRecords?.[tournamentId]);

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const resolutions = resolveFromParameters(params, [
    { [PARAM]: MATCHUP, attr: { [IN_CONTEXT]: true }, [ERROR]: MATCHUP_NOT_FOUND },
  ]);
  const matchUp = resolutions.matchUp?.matchUp;
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const { checkedInParticipantIds = [] } = getCheckedInParticipantIds({ matchUp });

  const { participantId, matchUpId, drawDefinition, attributedTo, occurredAt, attestationId, notes } = params;
  const wasCheckedIn = checkedInParticipantIds.includes(participantId);
  const args = {
    attributedTo,
    occurredAt,
    attestationId,
    notes,
    tournamentRecord,
    drawDefinition,
    participantId,
    matchUpId,
    matchUp,
  };

  if (checkedIn) {
    // checkInParticipant validates the subject before it confirms an existing check-in, and appends nothing
    const result = checkInParticipant(args);
    if (result.error) return result;
    return { ...SUCCESS, checkedIn: true, changed: !wasCheckedIn };
  }

  // checkOutParticipant's play/score and subject guards run BEFORE its not-checked-in refusal, so that
  // refusal is reached only by a valid request for the state already held
  const result = checkOutParticipant(args);
  if (result.error?.code === PARTICIPANT_NOT_CHECKED_IN.code) return { ...SUCCESS, checkedIn: false, changed: false };
  if (result.error) return result;
  return { ...SUCCESS, checkedIn: false, changed: true };
}
