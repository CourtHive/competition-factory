import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getMatchUpPresence } from '@Acquire/presenceAttestations';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DRAW_DEFINITION, ERROR, MATCHUP_ID } from '@Constants/attributeConstants';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import type { PresenceAttestation } from '@Types/presenceTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * The matchUp's check-in log, **including the attester** — the counterpart of
 * `getParticipantPresenceHistory`, and the only read that carries `attributedTo` for a check-in.
 *
 * Every bulk emission strips it (D-PRIV): hydration removes it from `matchUp.checkIns` and from
 * `sides[].participant.presence`, and `getParticipants` removes it from participants and the map. That
 * left check-in attribution **write-only** — storable and unreadable — so a desk had no way to see
 * who it had just recorded.
 *
 * Deliberately a separate, named call rather than a flag on an existing query: a server can gate one
 * method on a permission, and a caller has to ask for the attester by name rather than receive it by
 * accident inside a payload fetched for something else.
 *
 * Reads the STORED matchUp — a hydrated one has already been stripped, so folding one here would
 * return exactly the thing this exists to return.
 */
export function getMatchUpCheckInHistory(params: {
  tournamentRecord?: any;
  drawDefinition?: any;
  matchUpId: string;
  event?: any;
}): { checkIns?: PresenceAttestation[]; success?: boolean; error?: any } {
  const paramCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true }, { [MATCHUP_ID]: true }]);
  if (paramCheck[ERROR]) return paramCheck;

  const { drawDefinition, matchUpId, event } = params;
  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return { [ERROR]: MATCHUP_NOT_FOUND };

  return { ...SUCCESS, checkIns: getMatchUpPresence(matchUp) };
}
