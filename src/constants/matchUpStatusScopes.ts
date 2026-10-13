import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { CHALLENGED, DEAD_RUBBER } from './matchUpStatusValues';
import { LADDER } from './drawDefinitionConstants';

/**
 * Where a matchUpStatus is allowed to be used.
 *
 * MOST statuses are universal — `COMPLETED` means the same thing in every draw. A few are not:
 * `CHALLENGED` exists only in a LADDER, and `DEAD_RUBBER` only on a rubber of a team tie or on a
 * DOUBLE_ELIMINATION Decider that is not needed.
 *
 * This map makes the scope declarable, and `getMatchUpStatusScopeViolation` makes it enforceable.
 * Absent from the map means unscoped: valid anywhere, which is the correct default and keeps every
 * existing status behaving exactly as it does today.
 */
export type MatchUpStatusScope = {
  /** Valid only in these drawTypes. */
  drawTypes?: string[];
  /** Valid only on a matchUp that belongs to a team tie (but see `deciderAllowed`). */
  tieMatchUpOnly?: boolean;
  /** With `tieMatchUpOnly`: ALSO valid on a DOUBLE_ELIMINATION Decider, which is never a tie rubber. */
  deciderAllowed?: boolean;
  /** Shown to the caller when the scope is violated, so the error explains itself. */
  reason: string;
};

export const matchUpStatusScopes: Partial<Record<MatchUpStatusUnion, MatchUpStatusScope>> = {
  [CHALLENGED]: {
    drawTypes: [LADDER],
    reason: 'CHALLENGED describes a fixture a participant created, which only a LADDER produces',
  },

  // CA, 2026-10-13 (option (a) of TASKS.md § "`DEAD_RUBBER` is scoped by convention"): a rubber of a decided dual,
  // or an unneeded DOUBLE_ELIMINATION Decider — the factory itself writes the second (`reconcileDecider`). The Decider
  // is a SINGLES/DOUBLES matchUp or the TEAM dual itself, never a rubber, hence `deciderAllowed`.
  [DEAD_RUBBER]: {
    tieMatchUpOnly: true,
    deciderAllowed: true,
    reason: 'DEAD_RUBBER marks a rubber of a decided team tie, or a DOUBLE_ELIMINATION Decider that is not needed',
  },
};
