/**
 * A LINE GIVEN A WINNER UNDER A DUAL THAT HOLDS NO DRAWPOSITIONS IS REFUSED BEFORE THE FIRST WRITE (§ 2 row 24).
 *
 * `attemptToSetWinningSide` meets the dual's missing drawPositions on two paths. A corrected line (its stored winner
 * replaced), or one handing a decided dual to the other side, first takes back what the dual directed
 * (`removeDirectedParticipants`), which refuses before it writes. A line whose dual's winner changes is otherwise
 * directed as its dual (`directParticipants`): the dual's tally was written first and the error returned over it
 * (walk 2026-11-20, TEAM SINGLE_ELIMINATION 4 DOMINANT_DUO: the final held only a produced DEFAULTED, its arrived team
 * taken back out, and a line decided it COMPLETED 2-0 under `ERR_MISSING_DRAW_POSITIONS`). Both are asked here, of what
 * the call finds, by v1 (`attemptToSetWinningSide`, before either path) and by v2 (`refuseRoute`, the `winner` route).
 * A dual scored by hand is not tallied (`attemptToModifyScore`) and an ad hoc dual directs nobody: neither is asked.
 */
export function lineDirectsUnfedDual({
  dualWinningSideChange,
  projectedWinningSide,
  lineWinningSide,
  dualWinningSide,
  autoCalcDisabled,
  winningSide,
  dualUnfed,
}: {
  /** the dual holds no drawPositions and is not ad hoc (`removalMissingDrawPositions`) */
  dualUnfed: boolean;
  autoCalcDisabled: boolean;
  /** the line's stored winner, and the one the call names */
  lineWinningSide?: number;
  winningSide?: number;
  dualWinningSide?: number;
  /** the dual's winner once the line is written (its own where it keeps its decision) */
  projectedWinningSide?: number;
  dualWinningSideChange?: boolean;
}): boolean {
  if (!dualUnfed || autoCalcDisabled) return false;
  const corrected = !!lineWinningSide && lineWinningSide !== winningSide;
  const handsOver = !!dualWinningSide && !!projectedWinningSide && projectedWinningSide !== dualWinningSide;
  const directsDual = !!dualWinningSideChange || (!!projectedWinningSide && !dualWinningSide);
  return corrected || handsOver || directsDual;
}
