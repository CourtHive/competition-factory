import { byeWalkRefusal } from '@Mutate/matchUps/drawPositions/byeWalkRefusal';
import { planDrawPositionBye } from '@Mutate/matchUps/drawPositions/planDrawPositionBye';
import {
  assignDrawPositionBye as placeDrawPositionBye,
  AssignDrawPositionByeArgs,
} from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';

// types
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * THE PUBLIC BYE PLACEMENT: planned against a draft of the draw, every rule asked before the first write, then
 * committed as a finite list of bound writes (`planDrawPositionBye`).
 *
 * The engine's own placements (draw generation, a loser's BYE during scoring, a swap, a propagated BYE) keep calling the
 * writer directly. So does a public call that hands in draw state of its own (`structure`, `matchUpsMap`,
 * `inContextDrawMatchUps`, `loserMatchUp`) or declares a propagation placement: its result is the writer's, unchanged.
 *
 * A walk that meets an exit the planner does not yet plan through is placed by the writer too, which can meet some of
 * its refusals only after it has written (a loser seat downstream already filled, met once the BYE and the advance
 * before it are written). Those refusals are asked first, of the record as it stands (`byeWalkRefusal`): a placement
 * any of them refuses returns that refusal having written nothing, and one none refuses is the writer's, handed the
 * draw's map and in-context matchUps (the planner's hydration of the seat) and the planner's answer on the seat's
 * activity, so it does not build or ask them again.
 */
export function assignDrawPositionBye(params: AssignDrawPositionByeArgs) {
  const { structure, matchUpsMap, inContextDrawMatchUps, loserMatchUp, byeFromPropagation } = params;
  if (structure || matchUpsMap || inContextDrawMatchUps || loserMatchUp || byeFromPropagation)
    return placeDrawPositionBye(params);
  const planned = planDrawPositionBye(params);
  if (planned.unplanned !== undefined) return placeOnTheExitWalk(params, planned.seatHydration);
  planned.commit?.();
  return planned.result;
}

/** the writer's placement, once nothing it could refuse after writing does (`byeWalkRefusal`) */
function placeOnTheExitWalk(params: AssignDrawPositionByeArgs, seatHydration?: HydratedMatchUp[]) {
  const checked = byeWalkRefusal({ ...params, inContextDrawMatchUps: seatHydration });
  if (checked.refusal) return checked.refusal;
  const { matchUpsMap, inContextDrawMatchUps } = checked;
  // the planner asked the seat's activity of the record as it stands, and nothing is written before the writer asks it
  return placeDrawPositionBye({ ...params, matchUpsMap, inContextDrawMatchUps, activityAsked: true });
}
