import { byeWalkRefusal } from '@Mutate/matchUps/drawPositions/byeWalkRefusal';
import { planDrawPositionBye } from '@Mutate/matchUps/drawPositions/planDrawPositionBye';
import {
  assignDrawPositionBye as placeDrawPositionBye,
  AssignDrawPositionByeArgs,
} from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';

// constants and types
import { BYE_WRITER_PARAMS } from '@Constants/internalParamsConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/** a public placement's params: ids and the caller's options, never the writer's own */
export type PublicAssignDrawPositionByeArgs = Omit<AssignDrawPositionByeArgs, (typeof BYE_WRITER_PARAMS)[number]>;

/**
 * THE PUBLIC BYE PLACEMENT: planned against a draft of the draw, every rule asked before the first write, then
 * committed as a finite list of bound writes (`planDrawPositionBye`).
 *
 * The engine's own placements (draw generation, a loser's BYE during scoring, a swap, a propagated BYE) call the writer
 * directly. A public call takes ids, never resolved draw state: one that hands in the writer's own params (`structure`,
 * `matchUpsMap`, `inContextDrawMatchUps`, `loserMatchUp`, `byeFromPropagation`, `drawPositionsInactive`,
 * `activityAsked`) is refused with INVALID_VALUES, its context naming them, before anything is read or written: they
 * reach the writer past the checks a public placement makes first, and the writer can refuse after writing.
 *
 * A walk that meets an exit the planner does not yet plan through is placed by the writer too, which can meet some of
 * its refusals only after it has written (a loser seat downstream already filled, met once the BYE and the advance
 * before it are written). Those refusals are asked first, of the record as it stands (`byeWalkRefusal`): a placement
 * any of them refuses returns that refusal having written nothing, and one none refuses is the writer's, handed the
 * draw's map and in-context matchUps (the planner's hydration of the seat) and the planner's answer on the seat's
 * activity, so it does not build or ask them again.
 */
export function assignDrawPositionBye(params: PublicAssignDrawPositionByeArgs) {
  const internal = BYE_WRITER_PARAMS.filter((key) => (params as Record<string, unknown>)?.[key] !== undefined);
  if (internal.length) return { error: INVALID_VALUES, context: { params: internal } };
  const planned = planDrawPositionBye(params);
  if (planned.unplanned !== undefined) return placeOnTheExitWalk(params, planned.seatHydration);
  planned.commit?.();
  return planned.result;
}

/** the writer's placement, once nothing it could refuse after writing does (`byeWalkRefusal`) */
function placeOnTheExitWalk(params: PublicAssignDrawPositionByeArgs, seatHydration?: HydratedMatchUp[]) {
  const checked = byeWalkRefusal({ ...params, inContextDrawMatchUps: seatHydration });
  if (checked.refusal) return checked.refusal;
  const { matchUpsMap, inContextDrawMatchUps } = checked;
  // the planner asked the seat's activity of the record as it stands, and nothing is written before the writer asks it
  return placeDrawPositionBye({ ...params, matchUpsMap, inContextDrawMatchUps, activityAsked: true });
}
