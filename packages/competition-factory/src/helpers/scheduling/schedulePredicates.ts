import { isPropagatedExit } from '@Helpers/drawTopology/sideExitProvenance';
import { isExit } from '@Validators/isExit';

// constants and types
import { BYE } from '@Constants/matchUpStatusConstants';
import { MatchUp } from '@Types/tournamentTypes';

/**
 * A matchUp that WILL NEVER BE PLAYED, and so can never use a slot it holds: a BYE, or an exit the
 * cascade produced — a WALKOVER or DEFAULTED stamped onto a side by an upstream double exit, with
 * nobody arriving to contest it. A walkover a director RECORDED between two participants is not in
 * this set: that is the director's own act, and they know what the court is doing.
 *
 * The two are treated the same way everywhere scheduling is concerned (CA, 2026-10-01): the
 * placement is preserved, shown rather than hidden, and the mutation that left it reports it.
 */
export function matchUpWillNeverBePlayed({ matchUp }: { matchUp?: MatchUp }): boolean {
  if (!matchUp) return false;
  if (matchUp.matchUpStatus === BYE) return true;
  return isExit(matchUp.matchUpStatus) && isPropagatedExit({ matchUp });
}
