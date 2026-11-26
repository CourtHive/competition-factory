import { planDrawPositionBye } from '@Mutate/matchUps/drawPositions/planDrawPositionBye';
import {
  assignDrawPositionBye as placeDrawPositionBye,
  AssignDrawPositionByeArgs,
} from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';

/**
 * THE PUBLIC BYE PLACEMENT: planned against a draft of the draw, every rule asked before the first write, then
 * committed as a finite list of bound writes (`planDrawPositionBye`).
 *
 * The engine's own placements (draw generation, a loser's BYE during scoring, a swap, a propagated BYE) keep calling the
 * writer directly. So does a public call that hands in draw state of its own (`structure`, `matchUpsMap`,
 * `inContextDrawMatchUps`, `loserMatchUp`) or declares a propagation placement, and one whose walk meets an exit the
 * planner does not yet plan through: its result is the writer's, unchanged.
 */
export function assignDrawPositionBye(params: AssignDrawPositionByeArgs) {
  const { structure, matchUpsMap, inContextDrawMatchUps, loserMatchUp, byeFromPropagation } = params;
  if (structure || matchUpsMap || inContextDrawMatchUps || loserMatchUp || byeFromPropagation)
    return placeDrawPositionBye(params);
  const planned = planDrawPositionBye(params);
  if (planned.unplanned !== undefined) return placeDrawPositionBye(params);
  planned.commit?.();
  return planned.result;
}
