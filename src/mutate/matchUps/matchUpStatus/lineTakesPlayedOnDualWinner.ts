/**
 * A TEAM LINE MAY NOT TAKE AWAY A WINNER ITS LINES GAVE THE DUAL AND THE DUAL HAS SENT ON TO A PLAYED-ON DOWNSTREAM
 * (CA, 2026-11-19, § 2 row 14; scoped to line-decided duals 2026-11-20).
 *
 * A line's result is tallied into its dual. Where the dual holds the winner its lines projected, its lines would no longer project that winner
 * (none, or the other side), and the dual's own downstream is active (the matchUp its winner went on to is decided or
 * played on), the call would change the winner of a matchUp whose winner has been played on. Accepted, it left the
 * record inconsistent: the dual un-decided with its former winner standing in a decided matchUp beyond, or that winner
 * taken back out of it and the decided result there discarded (class 4 of the 2026-11-19 closeout). It is asked of the
 * DUAL, whether or not the line itself has sent anything: the line's own propagation is not the question.
 *
 * Only a LINE-DECIDED dual is asked (`dualKeepsOwnDecision`'s `lineDecided`). A dual decided by its own exit or its own
 * call keeps its winner while its lines project none (CA, 2026-11-20), so its lines take nothing away and are accepted
 * one by one. A dual scored by hand is not tallied from its lines, so they change nothing there either. CA considered,
 * and rejected, accepting the call by turning a line-decided dual into a manually declared winner that keeps the
 * advanced winner.
 *
 * Read by v1 (`setMatchUpState`, before any write) and by v2 (`refuseDispatch`), each from its own view of the call.
 */
export function lineTakesPlayedOnDualWinner({
  projectedWinningSide,
  activeDownstream,
  autoCalcDisabled,
  dualWinningSide,
  lineDecided,
  isLine,
}: {
  projectedWinningSide?: number;
  activeDownstream?: boolean;
  autoCalcDisabled?: boolean;
  dualWinningSide?: number;
  lineDecided?: boolean;
  isLine?: boolean;
}): boolean {
  if (!isLine || !lineDecided || !activeDownstream || autoCalcDisabled || !dualWinningSide) return false;
  return projectedWinningSide !== dualWinningSide;
}
