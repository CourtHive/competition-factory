import { generateTieMatchUpScore } from '@Query/matchUp/tieMatchUpScore/generateTieMatchUpScore';

// constants and types
import type { DrawDefinition, Event, Structure, TieFormat } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { MatchUpsMap } from '@Types/factoryTypes';

/**
 * A DUAL DECIDED BY ITS OWN EXIT OR ITS OWN CALL KEEPS ITS WINNER WHILE ITS LINES PROJECT NONE (CA, 2026-11-20, class 4).
 *
 * A dual's winner comes from its lines (the tally) or from the dual itself: an exit (WALKOVER, DEFAULTED, ...) or a
 * winner named on it. A line write tallied the dual afresh either way, so the first line entered on a dual decided by
 * its own exit or call un-decided it: the dual went IN_PROGRESS, its winner was taken back out of the next dual, and a
 * result there was reset (class 4 of the 2026-11-19 closeout). The dual now keeps its winner, its status and its score
 * until its lines name a winner of their own; then the tally takes over, as on any dual.
 *
 * Its own decision is read off the dual as it stands before the write: a winner its lines did not project. A dual its
 * lines decided projected its own winner, and a line write that takes it away is a changed winner (§ 2 row 14). A dual
 * scored by hand is not tallied at all, so it is not asked.
 *
 * `lineDecided` answers the other half: the dual's winner is the one its lines project before the write, the dual the
 * row 14 refusal asks about (`lineTakesPlayedOnDualWinner`).
 *
 * Read by v1 (`resolveTieMatchUpContext`, which hands the kept winner on as the projected one) and by v2 (the view's
 * `line`), each from its own hydration of the dual.
 */
export function dualKeepsOwnDecision({
  projectedWinningSide,
  autoCalcDisabled,
  drawDefinition,
  dualMatchUp,
  matchUpsMap,
  tieFormat,
  structure,
  event,
}: {
  drawDefinition?: DrawDefinition;
  projectedWinningSide?: number;
  autoCalcDisabled?: boolean;
  dualMatchUp: HydratedMatchUp;
  matchUpsMap?: MatchUpsMap;
  tieFormat?: TieFormat;
  structure?: Structure;
  event?: Event;
}): { keepsDecision: boolean; lineDecided: boolean } {
  if (autoCalcDisabled || !dualMatchUp.winningSide) return { keepsDecision: false, lineDecided: false };
  const { winningSide: linesWinningSide } = generateTieMatchUpScore({
    matchUp: dualMatchUp,
    drawDefinition,
    matchUpsMap,
    structure,
    tieFormat,
    event,
  });
  const lineDecided = linesWinningSide === dualMatchUp.winningSide;
  return { keepsDecision: !lineDecided && !projectedWinningSide, lineDecided };
}
