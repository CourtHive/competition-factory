import { isActiveDownstream } from '@Query/drawDefinition/isActiveDownstream';
import type { PositionTargetsResult } from '@Query/matchUp/positionTargets';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * Once a dual's winner has played on, a line may not replace that winner.
 * A line-decided dual may not lose its winner either. A declared winner
 * stands while the lines project no winner, and a manually scored dual is not tallied.
 * Both pipelines ask before the line or its placements are written.
 */
export function lineTakesPlayedOnDualWinner({
  projectedWinningSide,
  activeDownstream,
  autoCalcDisabled,
  dualWinningSide,
  lineDecided,
  declaredWinnerPlayedOn,
  isLine,
}: {
  projectedWinningSide?: number;
  activeDownstream?: boolean;
  autoCalcDisabled?: boolean;
  dualWinningSide?: number;
  lineDecided?: boolean;
  declaredWinnerPlayedOn?: boolean;
  isLine?: boolean;
}): boolean {
  if (!isLine || !activeDownstream || autoCalcDisabled || !dualWinningSide) return false;
  return projectedWinningSide !== dualWinningSide && (!!declaredWinnerPlayedOn || !!lineDecided);
}

/** A declared winner is protected on its own path. A recorded consolation result on
 * the loser's path can stand when its incoming team changes. */
export function declaredWinnerPlayedOn(
  standing: number | undefined,
  projected: number | undefined,
  activeDownstream: boolean,
  targetData: PositionTargetsResult | undefined,
  drawDefinition: DrawDefinition,
  inContextDrawMatchUps?: HydratedMatchUp[],
): boolean {
  if (!standing || !projected || standing === projected || !activeDownstream) return false;
  const winnerMatchUp = targetData?.targetMatchUps?.winnerMatchUp;
  if (!winnerMatchUp) return false;
  if (!targetData.targetMatchUps?.loserMatchUp) return true;
  return isActiveDownstream({
    drawDefinition,
    inContextDrawMatchUps,
    targetData: { ...targetData, targetMatchUps: { winnerMatchUp } },
  });
}
