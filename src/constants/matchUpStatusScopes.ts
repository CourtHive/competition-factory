import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { LADDER } from './drawDefinitionConstants';
import { CHALLENGED } from './matchUpStatusValues';

/**
 * Where a matchUpStatus is allowed to be used.
 *
 * MOST statuses are universal — `COMPLETED` means the same thing in every draw. A few are not, and
 * until now that was expressed only by convention: `DEAD_RUBBER` is meaningful solely inside a team
 * tie, yet nothing prevents it being set on a singles matchUp in an elimination draw. It appears in
 * exclusion filters and nowhere else.
 *
 * This map makes the scope declarable, and `getMatchUpStatusScopeViolation` makes it enforceable.
 * Absent from the map means unscoped: valid anywhere, which is the correct default and keeps every
 * existing status behaving exactly as it does today.
 */
export type MatchUpStatusScope = {
  /** Valid only in these drawTypes. */
  drawTypes?: string[];
  /** Valid only on a matchUp that belongs to a team tie. */
  tieMatchUpOnly?: boolean;
  /** Shown to the caller when the scope is violated, so the error explains itself. */
  reason: string;
};

export const matchUpStatusScopes: Partial<Record<MatchUpStatusUnion, MatchUpStatusScope>> = {
  [CHALLENGED]: {
    drawTypes: [LADDER],
    reason: 'CHALLENGED describes a fixture a participant created, which only a LADDER produces',
  },

  // DEAD_RUBBER is the obvious second adopter — its scope is a tie rather than a drawType, which is
  // why this type expresses both — but it is deliberately NOT enabled here:
  //
  //   [DEAD_RUBBER]: { tieMatchUpOnly: true, reason: '…' },
  //
  // Turning it on would reject records and fixtures that are legal today, and team-tie propagation
  // is another session's surface. Left declared in a comment so the next person sees the mechanism
  // was built for more than one status, and can enable it deliberately rather than rediscover it.
};
